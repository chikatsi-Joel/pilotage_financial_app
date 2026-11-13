"""Backoffice : session admin, CSRF, KPI, notifications, configuration chiffrée."""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import AppSetting, AuthSession, NotificationLog, PushDevice, User, UserActivityDay
from app.services import auth_service, push_service, settings_store
from app.services.admin import auth as admin_auth
from app.services.admin import notifications as admin_notifications
from app.services.admin import remote_config
from tests.conftest import REAL_HYDRATE

ADMIN = {"email": "Boss@Lucia.app", "password": "un-mot-de-passe-long"}
H = {"X-Lucia-Admin": "1"}


@pytest.fixture
async def maker(monkeypatch):
    monkeypatch.setattr(settings, "settings_secret_key", "cle-de-test-suffisamment-longue")
    monkeypatch.setattr(admin_auth, "_failures", {})
    monkeypatch.setattr(auth_service, "_activity_seen", set())
    settings_store._cache.clear()
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    # Ces tests lisent vraiment la configuration en base (cache paresseux sur la base de test).
    monkeypatch.setattr(settings_store, "_hydrate", REAL_HYDRATE)
    monkeypatch.setattr(settings_store, "get_session_factory", lambda: maker)
    yield maker
    settings_store._cache.clear()
    await engine.dispose()


@pytest.fixture
async def client(maker):
    async def override_db():
        async with maker() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    async with maker() as db:
        await admin_auth.create_admin(ADMIN["email"], ADMIN["password"], db)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        yield c
    app.dependency_overrides.clear()


async def _login(client: httpx.AsyncClient) -> None:
    r = await client.post("/admin/api/login", json=ADMIN, headers=H)
    assert r.status_code == 200, r.text


async def test_admin_routes_require_session(client):
    assert (await client.get("/admin/api/overview")).status_code == 401
    assert (await client.get("/admin/api/settings")).status_code == 401


async def test_login_sets_httponly_cookie_and_me(client):
    r = await client.post("/admin/api/login", json=ADMIN, headers=H)
    assert r.json() == {"email": "boss@lucia.app"}
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie and "path=/admin" in cookie
    assert (await client.get("/admin/api/me")).json()["email"] == "boss@lucia.app"
    assert (await client.post("/admin/api/logout", headers=H)).status_code == 204
    assert (await client.get("/admin/api/me")).status_code == 401


async def test_login_needs_csrf_header_and_rate_limits(client):
    assert (await client.post("/admin/api/login", json=ADMIN)).status_code == 403
    bad = {**ADMIN, "password": "faux"}
    for _ in range(admin_auth.MAX_FAILURES):
        assert (await client.post("/admin/api/login", json=bad, headers=H)).status_code == 401
    # Même le bon mot de passe est refusé pendant la fenêtre de blocage.
    assert (await client.post("/admin/api/login", json=ADMIN, headers=H)).status_code == 429


async def test_mutations_without_csrf_header_are_refused(client):
    await _login(client)
    r = await client.put("/admin/api/settings/ollama_model", json={"value": "x"})
    assert r.status_code == 403


async def test_app_user_token_is_not_an_admin_session(client, maker):
    """Un compte de l'app ne donne aucun accès au backoffice."""
    async with maker() as db:
        db.add(User(name="Awa", currency="XAF", email="awa@example.com"))
        await db.commit()
    client.cookies.set(admin_auth.COOKIE_NAME, "jeton-inconnu", path="/admin")
    assert (await client.get("/admin/api/overview")).status_code == 401


async def test_secret_setting_is_encrypted_masked_and_used(client, maker):
    await _login(client)
    key = "sk-abcdefghijklmnop1234"
    r = await client.put("/admin/api/settings/ollama_api_key", json={"value": key}, headers=H)
    assert r.status_code == 204
    async with maker() as db:
        row = await db.get(AppSetting, "ollama_api_key")
    assert row.is_secret and key not in row.value  # chiffré en base
    listed = {s["key"]: s for s in (await client.get("/admin/api/settings")).json()}
    assert listed["ollama_api_key"]["value"] == "••••1234"
    assert listed["ollama_api_key"]["source"] == "database"
    assert key not in (await client.get("/admin/api/settings")).text
    assert await settings_store.get("ollama_api_key") == key  # utilisé par le client Ollama

    assert (await client.delete("/admin/api/settings/ollama_api_key", headers=H)).status_code == 204
    assert await settings_store.get("ollama_api_key") == settings.ollama_api_key  # retour au .env


async def test_secret_needs_server_key(client, monkeypatch):
    await _login(client)
    monkeypatch.setattr(settings, "settings_secret_key", "")
    r = await client.put("/admin/api/settings/ollama_api_key", json={"value": "abc"}, headers=H)
    assert r.status_code == 400 and "SETTINGS_SECRET_KEY" in r.json()["detail"]


async def test_custom_setting_key_validation(client):
    await _login(client)
    r = await client.put("/admin/api/settings/Bad-Key", json={"value": "x"}, headers=H)
    assert r.status_code == 400
    r = await client.put("/admin/api/settings/support_email", json={"value": "a@b.c"}, headers=H)
    assert r.status_code == 204
    listed = {s["key"]: s for s in (await client.get("/admin/api/settings")).json()}
    assert listed["support_email"]["value"] == "a@b.c" and not listed["support_email"]["known"]


async def test_overview_counts_active_users_and_notifications(client, maker):
    today = datetime.now(timezone.utc).date()
    async with maker() as db:
        a, b, c = (User(name=n, currency="XAF") for n in ("A", "B", "C"))
        db.add_all([a, b, c])
        await db.flush()
        db.add_all(
            [
                UserActivityDay(user_id=a.id, day=today),
                UserActivityDay(user_id=a.id, day=today - timedelta(days=3)),
                UserActivityDay(user_id=b.id, day=today - timedelta(days=10)),
                UserActivityDay(user_id=c.id, day=today - timedelta(days=45)),
                NotificationLog(user_id=a.id, key="month:2026-11:80"),
                PushDevice(user_id=a.id, token="ExponentPushToken[a]", platform="android"),
            ]
        )
        await db.commit()
    await _login(client)
    data = (await client.get("/admin/api/overview")).json()
    assert data["users_total"] == 3
    assert (data["active_today"], data["active_7d"], data["active_30d"]) == (1, 1, 2)
    assert data["push_devices"] == 1 and data["notifications_30d"] == 1
    assert len(data["series"]) == 30 and data["series"][-1] == {
        "day": today.isoformat(), "active": 1, "signups": 3, "notifications": 1
    }


async def test_authenticated_request_records_activity_once_per_day(maker):
    async with maker() as db:
        user = User(name="A", currency="XAF")
        db.add(user)
        await db.flush()
        db.add(AuthSession(user_id=user.id, token_hash=auth_service._sha256("tok")))
        await db.commit()
        for _ in range(3):
            assert (await auth_service.authenticate("tok", db)).id == user.id
        days = (await db.execute(select(UserActivityDay))).scalars().all()
    assert [d.day for d in days] == [datetime.now(timezone.utc).date()]


async def test_notifications_history_forget_and_send(client, maker, monkeypatch):
    sent: list[dict] = []

    async def fake_post(messages):
        sent.extend(messages)
        return [{"status": "ok"} for _ in messages]

    monkeypatch.setattr(push_service, "_post_expo", fake_post)
    async with maker() as db:
        user = User(name="Awa", currency="XAF", email="awa@example.com")
        db.add(user)
        await db.flush()
        db.add(PushDevice(user_id=user.id, token="ExponentPushToken[x]", platform="android"))
        db.add(NotificationLog(user_id=user.id, key="budget:c1:2026-11:100"))
        await db.commit()
    await _login(client)

    hist = (await client.get("/admin/api/notifications/history")).json()
    assert hist["total"] == 1 and hist["items"][0]["kind"] == "budget"
    log_id = hist["items"][0]["id"]
    assert (await client.delete(f"/admin/api/notifications/history/{log_id}", headers=H)).status_code == 204
    assert (await client.get("/admin/api/notifications/history")).json()["total"] == 0

    body = {"email": "AWA@example.com", "title": "Test", "body": "Bonjour"}
    r = await client.post("/admin/api/notifications/send", json=body, headers=H)
    assert r.json() == {"users": 1, "accepted": 1} and sent[-1]["title"] == "Test"
    stats = (await client.get("/admin/api/notifications/stats")).json()
    assert stats["by_kind"] == [{"kind": "admin", "label": "Envoi manuel", "count": 1}]

    unknown = {**body, "email": "nobody@example.com"}
    assert (await client.post("/admin/api/notifications/send", json=unknown, headers=H)).status_code == 404


async def test_broadcast_runs_in_background_batches_and_refuses_duplicates(client, maker, monkeypatch):
    calls: list[int] = []

    async def fake_post(messages):
        calls.append(len(messages))
        return [{"status": "ok"} for _ in messages]

    monkeypatch.setattr(push_service, "_post_expo", fake_post)
    monkeypatch.setattr(admin_notifications, "get_session_factory", lambda: maker)
    monkeypatch.setattr(admin_notifications, "_broadcast", {"running": False, "last": None})
    async with maker() as db:
        users = [User(name=f"U{i}", currency="XAF") for i in range(3)]
        db.add_all(users)
        await db.flush()
        # 150 appareils : deux lots (100 + 50) vers Expo.
        db.add_all(
            PushDevice(user_id=users[i % 3].id, token=f"ExponentPushToken[{i}]", platform="android")
            for i in range(150)
        )
        await db.commit()
    await _login(client)
    msg = {"title": "Info", "body": "Nouveauté"}
    r = await client.post("/admin/api/notifications/broadcast", json={**msg, "confirmation": "oui"}, headers=H)
    assert r.status_code == 400
    r = await client.post(
        "/admin/api/notifications/broadcast", json={**msg, "confirmation": "ENVOYER"}, headers=H
    )
    assert r.json() == {"users": 3, "devices": 150, "queued": True}
    await asyncio.gather(*admin_notifications._tasks)
    assert calls == [100, 50]
    again = await client.post(
        "/admin/api/notifications/broadcast", json={**msg, "confirmation": "ENVOYER"}, headers=H
    )
    assert again.status_code == 409  # même message dans les 10 minutes


async def test_broadcast_task_logs_one_entry_per_reached_user(maker, monkeypatch):
    """La tâche de fond (hors requête : sa propre session) journalise chaque utilisateur atteint."""

    async def fake_post(messages):
        return [{"status": "ok"} for _ in messages]

    monkeypatch.setattr(push_service, "_post_expo", fake_post)
    monkeypatch.setattr(admin_notifications, "get_session_factory", lambda: maker)
    monkeypatch.setattr(admin_notifications, "_broadcast", {"running": True, "last": None})
    async with maker() as db:
        users = [User(name=f"U{i}", currency="XAF") for i in range(3)]
        db.add_all(users)
        await db.flush()
        devices = [(users[i % 3].id, f"ExponentPushToken[{i}]") for i in range(150)]
        await db.commit()
    await admin_notifications._run_broadcast(uuid.uuid4(), devices, "Info", "Nouveauté")
    async with maker() as db:
        keys = (await db.execute(select(NotificationLog.key))).scalars().all()
    assert len(keys) == 3 and len(set(keys)) == 1 and keys[0].startswith("admin:")
    assert admin_notifications._broadcast["running"] is False


async def test_editing_custom_secret_keeps_it_encrypted(client, maker):
    """Régression : remplacer un secret libre sans repréciser `secret` ne le met pas en clair."""
    await _login(client)
    r = await client.put("/admin/api/settings/partner_token", json={"value": "first-secret-1111", "secret": True}, headers=H)
    assert r.status_code == 204
    r = await client.put("/admin/api/settings/partner_token", json={"value": "second-secret-2222"}, headers=H)
    assert r.status_code == 204
    async with maker() as db:
        row = await db.get(AppSetting, "partner_token")
    assert row.is_secret and "second-secret" not in row.value
    listed = {s["key"]: s for s in (await client.get("/admin/api/settings")).json()}
    assert listed["partner_token"]["value"] == "••••2222"
    downgrade = await client.put(
        "/admin/api/settings/partner_token", json={"value": "x", "secret": False}, headers=H
    )
    assert downgrade.status_code == 400


async def test_replacing_a_value_updates_the_cache_immediately(client):
    """Régression : après remplacement, le serveur utilise tout de suite la nouvelle valeur."""
    await _login(client)
    for key, first, second in (
        ("ollama_model", "model-a", "model-b"),
        ("ollama_api_key", "key-aaaaaaaa", "key-bbbbbbbb"),
    ):
        assert (await client.put(f"/admin/api/settings/{key}", json={"value": first}, headers=H)).status_code == 204
        assert await settings_store.get(key) == first
        assert (await client.put(f"/admin/api/settings/{key}", json={"value": second}, headers=H)).status_code == 204
        assert await settings_store.get(key) == second


async def test_concurrent_broadcasts_only_one_accepted(client, monkeypatch):
    async def fake_post(messages):
        return [{"status": "ok"} for _ in messages]

    monkeypatch.setattr(push_service, "_post_expo", fake_post)
    monkeypatch.setattr(admin_notifications, "_broadcast", {"running": False, "last": None})

    async def no_run(*_args):
        return None

    monkeypatch.setattr(admin_notifications, "_run_broadcast", no_run)
    await _login(client)
    body = {"confirmation": "ENVOYER", "body": "x"}
    results = await asyncio.gather(
        client.post("/admin/api/notifications/broadcast", json={**body, "title": "A"}, headers=H),
        client.post("/admin/api/notifications/broadcast", json={**body, "title": "B"}, headers=H),
    )
    assert sorted(r.status_code for r in results) == [200, 409]


async def test_parallel_login_attempts_are_capped(client):
    bad = {**ADMIN, "password": "faux"}
    results = await asyncio.gather(
        *(client.post("/admin/api/login", json=bad, headers=H) for _ in range(12))
    )
    codes = sorted(r.status_code for r in results)
    assert codes.count(401) == admin_auth.MAX_FAILURES and codes.count(429) == 12 - admin_auth.MAX_FAILURES


def test_failure_tracking_is_bounded(monkeypatch):
    monkeypatch.setattr(admin_auth, "_failures", {f"email:{i}": [0.0] for i in range(admin_auth.MAX_TRACKED + 5)})
    admin_auth._reserve_attempt("new@x.io", None)
    assert len(admin_auth._failures) <= admin_auth.MAX_TRACKED


def test_admin_cookie_secure_outside_development(monkeypatch):
    monkeypatch.setattr(settings, "admin_cookie_secure", None)
    monkeypatch.setattr(settings, "environment", "production")
    assert settings.admin_cookie_is_secure
    monkeypatch.setattr(settings, "environment", "development")
    assert not settings.admin_cookie_is_secure


async def test_ollama_base_url_requires_https_off_localhost(client):
    await _login(client)
    bad = await client.put("/admin/api/settings/ollama_base_url", json={"value": "http://evil.example"}, headers=H)
    assert bad.status_code == 400
    ok = await client.put("/admin/api/settings/ollama_base_url", json={"value": "http://localhost:11434"}, headers=H)
    assert ok.status_code == 204


def test_remote_config_token_cache_is_bound_to_account(monkeypatch):
    remote_config._token = ("ancienne-empreinte", "jeton", 1e12)
    remote_config.forget_token()
    assert remote_config._token is None


async def test_flags_need_service_account(client):
    await _login(client)
    r = await client.get("/admin/api/flags")
    assert r.status_code == 409 and "compte de service" in r.json()["detail"]


async def test_invalid_service_account_is_refused(client):
    await _login(client)
    r = await client.put(
        "/admin/api/settings/firebase_service_account", json={"value": "{\"a\": 1}"}, headers=H
    )
    assert r.status_code == 400



async def test_settings_cache_reads_database_once_until_invalidated(client, monkeypatch):
    """Cache paresseux : une lecture en base par clé, puis plus aucune tant que rien ne change."""
    reads: list[str] = []

    async def counting(key: str) -> str | None:
        reads.append(key)
        return await REAL_HYDRATE(key)

    monkeypatch.setattr(settings_store, "_hydrate", counting)
    await _login(client)
    for _ in range(5):
        await settings_store.get("ollama_model")
    assert reads == ["ollama_model"]

    await client.put("/admin/api/settings/ollama_model", json={"value": "m-new"}, headers=H)
    assert await settings_store.get("ollama_model") == "m-new"
    await settings_store.get("ollama_model")
    assert reads == ["ollama_model", "ollama_model"]  # une seule relecture après l'invalidation


async def test_invalidation_during_read_does_not_keep_stale_value(maker):
    """Une modification pendant une lecture en cours : la valeur lue (périmée) n'est pas gardée."""
    real_factory = settings_store.get_session_factory

    class InvalidateDuringRead:
        def __call__(self):
            settings_store.invalidate("ollama_model")  # modification concurrente
            return real_factory()()

    settings_store.get_session_factory = lambda: InvalidateDuringRead()
    try:
        await settings_store.get("ollama_model")
    finally:
        settings_store.get_session_factory = real_factory
    assert "ollama_model" not in settings_store._cache


async def test_sql_stats_require_admin_and_report_unavailable_on_sqlite(client):
    assert (await client.get("/admin/api/sql-stats")).status_code == 401
    await _login(client)
    data = (await client.get("/admin/api/sql-stats?sort=mean&limit=10")).json()
    assert data == {"available": False, "reason": "Statistiques SQL disponibles uniquement avec PostgreSQL"}
    assert (await client.get("/admin/api/sql-stats?sort=drop")).status_code == 422  # tri non listé
    assert (await client.post("/admin/api/sql-stats/reset", headers=H)).status_code == 409
    assert (await client.post("/admin/api/sql-stats/reset")).status_code == 403  # sans en-tête CSRF


async def test_sql_stats_reset_without_privilege_is_a_clear_409(monkeypatch):
    from sqlalchemy.exc import DBAPIError

    from app.services.admin import sql_stats

    async def available(_db):
        return None

    monkeypatch.setattr(sql_stats, "_availability", available)

    class _Denied:
        rolled_back = False

        async def execute(self, *_a, **_k):
            orig = Exception("permission denied")
            orig.sqlstate = "42501"  # type: ignore[attr-defined]
            raise DBAPIError("SELECT pg_stat_statements_reset", {}, orig)

        async def rollback(self):
            self.rolled_back = True

        async def commit(self):  # pragma: no cover - ne doit pas être appelé
            raise AssertionError("commit après échec")

    db = _Denied()
    with pytest.raises(sql_stats.SqlStatsUnavailable, match="GRANT EXECUTE"):
        await sql_stats.reset(db)  # type: ignore[arg-type]
    assert db.rolled_back
