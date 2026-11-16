"""Suppression de compte : les données de l'utilisateur partent, celles des autres restent."""

import time
from datetime import date

import httpx
import pytest
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import (
    NotificationLog,
    NotificationPreference,
    PushDevice,
    SavingsContribution,
    SavingsGoal,
    User,
    UserActivityDay,
)
from app.services import account_service, analytics_service, firebase_auth, notification_service
from app.services.auth_service import hash_password
from app.services.firebase_auth import FirebaseIdentity
from tests.test_query_optimizations import _seed_user

URL = "/api/v1/auth/account/delete"


@pytest.fixture
async def maker():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )

    # Sans cela SQLite ignore les clés étrangères : le test ne prouverait rien sur les cascades.
    @event.listens_for(engine.sync_engine, "connect")
    def _fk(conn, _):
        conn.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.fixture
def client(maker, monkeypatch):
    async def override_db():
        async with maker() as db:
            yield db

    monkeypatch.setattr(notification_service, "schedule_budget_alerts", lambda *a, **k: None)
    app.dependency_overrides[get_db] = override_db
    yield httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t")
    app.dependency_overrides.clear()


async def _full_user(db, n: int, password: str = "mot-de-passe-solide") -> tuple[User, str]:
    """Un utilisateur avec des lignes dans toutes les tables qui le concernent."""
    user, _, token = await _seed_user(db, n, months=3)
    user.password_hash = hash_password(password)
    db.add_all(
        [
            PushDevice(user_id=user.id, token=f"ExponentPushToken[{n}]", platform="android"),
            NotificationPreference(user_id=user.id),
            NotificationLog(user_id=user.id, key=f"k{n}"),
            UserActivityDay(user_id=user.id, day=date(2026, 3, 1)),
        ]
    )
    await db.commit()
    await analytics_service.refresh_analytics(user.id, "2026-03", db, date(2026, 11, 16))
    return user, token


async def _rows_for(db, user_id) -> dict[str, int]:
    """Lignes restantes par table ayant une colonne user_id (détecte une table oubliée)."""
    counts = {}
    for table in Base.metadata.sorted_tables:
        if "user_id" in table.c:
            counts[table.name] = (
                await db.execute(
                    select(func.count()).select_from(table).where(table.c.user_id == user_id)
                )
            ).scalar_one()
    return counts


async def test_deletes_every_row_of_the_user_and_keeps_others(maker, client):
    async with maker() as db:
        a, token = await _full_user(db, 2)
        b, _ = await _full_user(db, 3)
        before_b = await _rows_for(db, b.id)
        goal_a = (
            await db.execute(select(SavingsGoal.id).where(SavingsGoal.user_id == a.id))
        ).scalar_one()

    async with client as c:
        r = await c.post(
            URL,
            json={"password": "mot-de-passe-solide"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 204
        # La session a disparu avec le compte.
        me = await c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 401

    async with maker() as db:
        assert await db.get(User, a.id) is None
        assert set((await _rows_for(db, a.id)).values()) == {0}
        contributions = (
            await db.execute(
                select(func.count())
                .select_from(SavingsContribution)
                .where(SavingsContribution.savings_goal_id == goal_a)
            )
        ).scalar_one()
        assert contributions == 0
        assert await _rows_for(db, b.id) == before_b
        assert sum(before_b.values()) > 0


async def test_wrong_password_is_403_and_keeps_the_session(maker, client):
    async with maker() as db:
        _, token = await _full_user(db, 2)
    async with client as c:
        auth = {"Authorization": f"Bearer {token}"}
        assert (await c.post(URL, json={"password": "faux"}, headers=auth)).status_code == 403
        assert (await c.post(URL, json={}, headers=auth)).status_code == 403
        assert (await c.get("/api/v1/auth/me", headers=auth)).status_code == 200


def _identity(uid: str, age: int) -> FirebaseIdentity:
    return FirebaseIdentity(
        uid=uid,
        email="a@x.io",
        email_verified=True,
        name=None,
        provider="google.com",
        auth_time=int(time.time()) - age,
    )


@pytest.mark.parametrize(
    ("uid", "age", "status"),
    [("fb-a", 10, 204), ("fb-autre", 10, 403), ("fb-a", 3600, 403)],
)
async def test_firebase_reauth(maker, client, monkeypatch, uid, age, status):
    async with maker() as db:
        user, token = await _full_user(db, 2)
        user.firebase_uid = "fb-a"
        db.add(user)
        await db.commit()

    async def verify(_token):
        return _identity(uid, age)

    monkeypatch.setattr(firebase_auth, "verify_id_token", verify)
    deleted = []

    async def fake_delete(fid):
        deleted.append(fid)
        return True

    monkeypatch.setattr(account_service, "delete_firebase_user", fake_delete)
    async with client as c:
        r = await c.post(
            URL, json={"id_token": "x" * 40}, headers={"Authorization": f"Bearer {token}"}
        )
    assert r.status_code == status
    assert deleted == (["fb-a"] if status == 204 else [])


async def test_firebase_admin_delete_is_skipped_without_service_account():
    # conftest : aucun réglage en base -> pas de compte de service -> aucun appel réseau.
    assert await account_service.delete_firebase_user("fb-a") is False


@pytest.mark.parametrize(
    ("status", "body", "ok"),
    [
        (200, "{}", True),
        (400, '{"error":{"message":"USER_NOT_FOUND"}}', True),
        (500, "boom", False),
    ],
)
async def test_firebase_admin_delete_calls_google(monkeypatch, status, body, ok):
    import json

    from app.services import google_oauth, settings_store

    account = {
        "client_email": "sa@p.iam",
        "private_key": "k",
        "token_uri": "https://t",
        "project_id": "p",
    }

    async def get(key):
        return json.dumps(account) if key == "firebase_service_account" else None

    async def token(_client, _account, scope):
        assert scope == account_service.FIREBASE_SCOPE
        return "tok"

    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(
            (str(request.url), json.loads(request.content), request.headers["authorization"])
        )
        return httpx.Response(status, text=body)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(settings_store, "get", get)
    monkeypatch.setattr(google_oauth, "access_token", token)
    monkeypatch.setattr(
        account_service.httpx,
        "AsyncClient",
        lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw),
    )
    assert await account_service.delete_firebase_user("fb-a") is ok
    assert calls == [
        (
            "https://identitytoolkit.googleapis.com/v1/projects/p/accounts:delete",
            {"localId": "fb-a"},
            "Bearer tok",
        )
    ]


async def test_firebase_linked_account_can_confirm_with_password(maker, client):
    """Appareil sans session Firebase : le mot de passe Lucia suffit (sinon impasse)."""
    async with maker() as db:
        user, token = await _full_user(db, 2)
        user.firebase_uid = "fb-a"
        db.add(user)
        await db.commit()
    async with client as c:
        r = await c.post(
            URL,
            json={"password": "mot-de-passe-solide"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == 204


async def test_firebase_cleanup_error_after_commit_still_returns_204(maker, client, monkeypatch):
    """Clé de compte de service invalide : la base est effacée, la réponse reste 204."""
    import json

    from app.services import settings_store

    async with maker() as db:
        user, token = await _full_user(db, 2)
        user.firebase_uid = "fb-a"
        db.add(user)
        await db.commit()
        user_id = user.id

    async def get(key):
        bad = {"client_email": "sa@p.iam", "private_key": "pas-une-cle", "token_uri": "https://t"}
        return json.dumps(bad) if key == "firebase_service_account" else None

    monkeypatch.setattr(settings_store, "get", get)
    async with client as c:
        r = await c.post(
            URL,
            json={"password": "mot-de-passe-solide"},
            headers={"Authorization": f"Bearer {token}"},
        )
    assert r.status_code == 204
    async with maker() as db:
        assert await db.get(User, user_id) is None
