"""Freemium de l'analyse IA : seule une demande explicite consomme le quota (première analyse
du mois ou mise à jour), jamais l'affichage, la tâche planifiée ni un appel en double."""

from __future__ import annotations

import asyncio
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.models import AIUsage, User
from app.schemas.common import ExpenseCreate
from app.services import ai_analysis_service, ai_quota, expense_service, settings_store
from app.services.admin import premium
from tests.test_query_optimizations import _FakeProvider, _seed_user, env  # noqa: F401

NOW = datetime(2026, 11, 17, 12, tzinfo=UTC)
PERIOD = "2026-11"


def _freemium(monkeypatch, enabled: bool = True, quota: int = 2) -> None:
    async def fake() -> tuple[bool, int]:
        return enabled, quota

    monkeypatch.setattr(ai_quota, "freemium_settings", fake)


async def _new_expense(db, user, cat, amount: str, day: int) -> None:
    await expense_service.create(
        user.id,
        ExpenseCreate(amount=Decimal(amount), category_id=cat.id, expense_date=date(2026, 11, day)),
        db,
    )


async def _usage(db) -> int:
    return (await db.execute(select(func.count()).select_from(AIUsage))).scalar_one()


async def _analyze(db, user, provider, **kw):
    return await ai_analysis_service.analyze(user.id, PERIOD, db, provider, now=NOW, **kw)


# ── Réglages ────────────────────────────────────────────────────────────────


async def test_settings_are_read_from_backoffice(monkeypatch) -> None:
    values = {"ai_freemium_enabled": "TRUE", "ai_free_quota": "5"}

    async def get(key: str) -> str:
        return values[key]

    monkeypatch.setattr(settings_store, "get", get)
    assert await ai_quota.freemium_settings() == (True, 5)
    values.update(ai_freemium_enabled="false", ai_free_quota="²")
    assert await ai_quota.freemium_settings() == (False, ai_quota.DEFAULT_QUOTA)


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("ai_free_quota", "-1"),
        ("ai_free_quota", "trois"),
        ("ai_free_quota", "²"),
        ("ai_free_quota", "1001"),
        ("ai_freemium_enabled", "oui"),
    ],
)
async def test_invalid_freemium_settings_are_refused(env, key, value) -> None:  # noqa: F811
    _, maker, _ = env
    async with maker() as db:
        with pytest.raises(settings_store.SettingsError):
            await settings_store.set_value(db, key, value, None, "admin@x.io")


async def test_default_is_unlimited_and_not_counted(env) -> None:  # noqa: F811
    """Freemium coupé (défaut) : IA illimitée, aucun appel enregistré dans le quota."""
    _, maker, _ = env
    provider = _FakeProvider()
    async with maker() as db:
        user, cats, _ = await _seed_user(db, 2)
        await _analyze(db, user, provider)
        await _new_expense(db, user, cats[0], "500", 3)
        await _analyze(db, user, provider)
        q = await ai_quota.status(user.id, db, NOW)
        assert await _usage(db) == 0
    assert provider.calls == 2
    assert q.enabled is False and q.limit is None and q.used == 0


# ── Ce qui consomme ─────────────────────────────────────────────────────────


async def test_only_explicit_requests_consume(env, monkeypatch) -> None:  # noqa: F811
    _freemium(monkeypatch, quota=2)
    _, maker, _ = env
    provider = _FakeProvider()
    async with maker() as db:
        user, cats, _ = await _seed_user(db, 2)
        # Première analyse du mois : comptée.
        first = await _analyze(db, user, provider)
        assert first["summary"] == "analyse 1" and await _usage(db) == 1
        # Affichage, même avec `force`, sur des données inchangées : rien n'est consommé.
        await _analyze(db, user, provider)
        await _analyze(db, user, provider, force=True)
        assert provider.calls == 1 and await _usage(db) == 1

        # Nouvelle dépense puis simple affichage : ancienne analyse, datée, non consommée.
        await _new_expense(db, user, cats[0], "500", 3)
        shown = await _analyze(db, user, provider)
        assert provider.calls == 1 and shown["stale"] is True and shown["analyzed_at"]
        assert shown["summary"] == "analyse 1"

        # Mise à jour demandée : comptée.
        updated = await _analyze(db, user, provider, force=True)
        assert updated["summary"] == "analyse 2" and await _usage(db) == 2

        # Quota épuisé : la mise à jour suivante est refusée, l'analyse précédente reste.
        await _new_expense(db, user, cats[0], "600", 4)
        blocked = await _analyze(db, user, provider, force=True)
        q = await ai_quota.status(user.id, db, NOW)
    assert provider.calls == 2
    assert blocked["quota_exceeded"] is True and blocked["stale"] is True
    assert blocked["summary"] == "analyse 2"
    assert (q.limit, q.used, q.remaining) == (2, 2, 0)
    assert q.resets_at == datetime(2026, 12, 1, tzinfo=UTC)


async def test_stale_analysis_is_not_rechecked_against_new_numbers(env, monkeypatch) -> None:  # noqa: F811
    """Ses chiffres dataient de son propre contexte : pas de faux « chiffres non vérifiés »."""
    _freemium(monkeypatch, quota=1)
    _, maker, _ = env
    provider = _FakeProvider()
    async with maker() as db:
        user, cats, _ = await _seed_user(db, 2)
        await _analyze(db, user, provider)
        await _new_expense(db, user, cats[0], "12345", 3)
        shown = await _analyze(db, user, provider)
    assert shown["stale"] is True and not shown.get("number_warnings")


async def test_exhausted_quota_without_analysis_returns_empty(env, monkeypatch) -> None:  # noqa: F811
    _freemium(monkeypatch, quota=0)
    _, maker, _ = env
    provider = _FakeProvider()
    async with maker() as db:
        user, _, _ = await _seed_user(db, 2)
        r = await _analyze(db, user, provider)
    assert provider.calls == 0 and r["quota_exceeded"] is True and r["summary"] == ""


async def test_concurrent_requests_for_the_same_analysis_consume_once(env, monkeypatch) -> None:  # noqa: F811
    """Deux écrans ouverts en même temps : une seule unité, un seul appel au modèle."""
    _freemium(monkeypatch, quota=3)
    _, maker, _ = env
    started = asyncio.Event()
    release = asyncio.Event()

    class Slow(_FakeProvider):
        async def analyze(self, context):
            started.set()
            await release.wait()
            return await super().analyze(context)

    provider = Slow()
    async with maker() as db:
        user, _, _ = await _seed_user(db, 2)
    async with maker() as db1, maker() as db2:
        first = asyncio.create_task(_analyze(db1, user, provider))
        await started.wait()
        second = await _analyze(db2, user, provider)
        release.set()
        done = await first
    async with maker() as db:
        used = await _usage(db)
    assert second["pending"] is True and done["summary"] == "analyse 1"
    assert provider.calls == 1 and used == 1


async def test_failed_calls_do_not_consume_quota(env, monkeypatch) -> None:  # noqa: F811
    _freemium(monkeypatch, quota=1)
    _, maker, _ = env

    class Broken(_FakeProvider):
        async def analyze(self, context):
            self.calls += 1
            raise RuntimeError("réseau")

    async with maker() as db:
        user, _, _ = await _seed_user(db, 2)
        await _analyze(db, user, _FakeProvider(fallback=True))
        assert await _usage(db) == 0
        with pytest.raises(RuntimeError):
            await _analyze(db, user, Broken())
        assert await _usage(db) == 0
        ok = await _analyze(db, user, _FakeProvider())
    assert ok["summary"] == "analyse 1"


async def test_background_job_never_consumes(env, monkeypatch) -> None:  # noqa: F811
    """Tâche planifiée : rend une analyse à jour, sinon rien (ni appel ni conseil périmé)."""
    _freemium(monkeypatch, quota=3)
    _, maker, _ = env
    provider = _FakeProvider()
    async with maker() as db:
        user, cats, _ = await _seed_user(db, 2)
        skipped = await _analyze(db, user, provider, background=True)
        assert skipped.get("skipped") is True and provider.calls == 0

        await _analyze(db, user, provider)  # analyse demandée par l'utilisateur
        fresh = await _analyze(db, user, provider, background=True)
        assert fresh["summary"] == "analyse 1"

        await _new_expense(db, user, cats[0], "500", 3)
        again = await _analyze(db, user, provider, background=True)
        assert again.get("skipped") is True
        assert provider.calls == 1 and await _usage(db) == 1


async def test_weekly_push_skips_free_accounts_without_fresh_analysis(env, monkeypatch) -> None:  # noqa: F811
    from app.services import notification_service

    _freemium(monkeypatch, quota=3)
    sent: list[str] = []

    async def fake_deliver(db, user_id, tokens, title, body, data):
        sent.append(title)

    async def claim(*_a, **_k) -> bool:
        return True

    monkeypatch.setattr(notification_service, "_deliver", fake_deliver)
    monkeypatch.setattr(notification_service, "_claim", claim)
    _, maker, _ = env
    provider = _FakeProvider()
    async with maker() as db:
        user, _, _ = await _seed_user(db, 2)
        await notification_service.send_ai_insight(user.id, date(2026, 11, 15), db, provider)
        assert sent == [] and provider.calls == 0 and await _usage(db) == 0


async def test_quota_resets_each_month(env, monkeypatch) -> None:  # noqa: F811
    _freemium(monkeypatch, quota=1)
    _, maker, _ = env
    async with maker() as db:
        user, _, _ = await _seed_user(db, 2)
        db.add(AIUsage(user_id=user.id, created_at=datetime(2026, 10, 31, 23, 59, tzinfo=UTC)))
        await db.commit()
        assert (await ai_quota.status(user.id, db, NOW)).remaining == 1
        first = await ai_quota.reserve(user.id, PERIOD, "a", db, NOW)
        assert not isinstance(first, ai_quota.Reservation)
        second = await ai_quota.reserve(user.id, PERIOD, "b", db, NOW)
        assert second is ai_quota.Reservation.EXCEEDED


async def test_enabling_freemium_mid_month_starts_from_zero(env, monkeypatch) -> None:  # noqa: F811
    """Avant l'activation, rien n'était compté : personne n'est bloqué d'emblée."""
    _, maker, _ = env
    provider = _FakeProvider()
    async with maker() as db:
        user, cats, _ = await _seed_user(db, 2)
        for day in (3, 4, 5):
            await _new_expense(db, user, cats[0], "100", day)
            await _analyze(db, user, provider)
        _freemium(monkeypatch, quota=2)
        q = await ai_quota.status(user.id, db, NOW)
    assert provider.calls == 3 and (q.used, q.remaining) == (0, 2)


# ── Premium ─────────────────────────────────────────────────────────────────


async def test_premium_is_unlimited_and_not_counted(env, monkeypatch) -> None:  # noqa: F811
    _freemium(monkeypatch, quota=0)
    _, maker, _ = env
    provider = _FakeProvider()
    async with maker() as db:
        user, _, _ = await _seed_user(db, 2)
        await premium.set_premium(db, user.id, 1, "admin@x.io", now=NOW)
        r = await _analyze(db, user, provider)
        q = await ai_quota.status(user.id, db, NOW)
    assert provider.calls == 1 and not r.get("quota_exceeded")
    assert q.premium is True and q.limit is None and q.used == 0


async def test_admin_extends_and_revokes_premium(env, monkeypatch, caplog) -> None:  # noqa: F811
    _freemium(monkeypatch, quota=3)
    _, maker, _ = env
    async with maker() as db:
        user, _, _ = await _seed_user(db, 2)
        first = await premium.set_premium(db, user.id, 1, "admin@x.io", now=NOW)
        assert first["premium"] is True and first["premium_until"] == NOW + timedelta(days=30)
        # Encore actif : prolongé à partir de sa fin, pas de maintenant.
        later = NOW + timedelta(days=10)
        second = await premium.set_premium(db, user.id, 2, "admin@x.io", now=later)
        assert second["premium_until"] == NOW + timedelta(days=90)
        revoked = await premium.set_premium(db, user.id, 0, "admin@x.io", now=NOW)
        assert revoked["premium"] is False and revoked["premium_until"] is None
        assert (await db.get(User, user.id, populate_existing=True)).premium_until is None
    changes = [r.getMessage() for r in caplog.records if r.msg.startswith("premium_changed")]
    assert len(changes) == 3
    assert f"admin=admin@x.io user={user.id} months=1 old=None" in changes[0]


async def test_admin_search_counts_usage_and_escapes_wildcards(env, monkeypatch) -> None:  # noqa: F811
    _freemium(monkeypatch, quota=3)
    _, maker, _ = env
    async with maker() as db:
        user, _, _ = await _seed_user(db, 2)
        db.add(User(name="Autre", currency="XAF", email="a_b@x.io", password_hash="x"))
        db.add(AIUsage(user_id=user.id, created_at=NOW))
        db.add(AIUsage(user_id=user.id, created_at=datetime(2026, 10, 2, tzinfo=UTC)))
        await db.commit()
        found = await premium.search(db, "Q2@", now=NOW)
        wildcard = await premium.search(db, "_", now=NOW)
    assert found["freemium_enabled"] is True and found["free_quota"] == 3
    assert [u["email"] for u in found["users"]] == ["q2@x.io"]
    assert found["users"][0]["ai_used_this_month"] == 1
    # « _ » cherché littéralement : seul a_b@x.io correspond.
    assert [u["email"] for u in wildcard["users"]] == ["a_b@x.io"]
