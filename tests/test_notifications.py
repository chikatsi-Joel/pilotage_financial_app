"""Notifications push : appareils, alertes budget, paliers d'épargne, rappels planifiés."""

from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import (
    Budget,
    Category,
    Essentiality,
    Expense,
    NotificationLog,
    OptimizationPotential,
    PushDevice,
    SavingsContribution,
    SavingsGoal,
    User,
)
from app.schemas.common import DeviceRegister, NotificationPreferencesUpdate
from app.services import notification_service, push_service

TOKEN = "ExponentPushToken[abcdefghijk]"


class Expo:
    """Faux service Expo : mémorise les messages et renvoie un ticket « ok » par message."""

    def __init__(self) -> None:
        self.messages: list[dict] = []
        self.error: str | None = None

    async def post(self, messages: list[dict]) -> list[dict]:
        self.messages.extend(messages)
        if self.error:
            return [{"status": "error", "details": {"error": self.error}} for _ in messages]
        return [{"status": "ok", "id": "x"} for _ in messages]


@pytest.fixture
def expo(monkeypatch) -> Expo:
    fake = Expo()
    monkeypatch.setattr(push_service, "_post_expo", fake.post)
    return fake


@pytest.fixture
async def session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        yield db
    await engine.dispose()


async def _user(db: AsyncSession, **prefs) -> User:
    user = User(name="Awa", currency="XAF")
    db.add(user)
    await db.flush()
    uid = user.id
    await push_service.register_device(uid, DeviceRegister(token=TOKEN, platform="android"), db)
    if prefs:
        await push_service.update_preferences(uid, NotificationPreferencesUpdate(**prefs), db)
    return SimpleNamespace(id=uid)


async def _category(
    db: AsyncSession, user: User, budget: str | None = "1000", name: str = "Transport"
) -> Category:
    cat = Category(
        user_id=user.id,
        name=name,
        essentiality=Essentiality.ESSENTIAL,
        optimization_potential=OptimizationPotential.LOW,
        monthly_budget=Decimal(budget) if budget else None,
    )
    db.add(cat)
    await db.flush()
    return SimpleNamespace(id=cat.id)


async def _spend(db: AsyncSession, user: User, cat: Category, amount: str, day: date) -> None:
    db.add(Expense(user_id=user.id, category_id=cat.id, amount=Decimal(amount), expense_date=day))
    await db.commit()


# ── Appareils et préférences ─────────────────────────────────────────────


async def test_register_device_is_idempotent_and_moves_between_users(session, expo) -> None:
    first = await _user(session)
    other_row = User(name="Bob", currency="XAF")
    session.add(other_row)
    await session.flush()
    other = SimpleNamespace(id=other_row.id)

    await push_service.register_device(first.id, DeviceRegister(token=TOKEN), session)
    await push_service.register_device(other.id, DeviceRegister(token=TOKEN), session)

    devices = (await session.execute(select(PushDevice))).scalars().all()
    assert len(devices) == 1
    assert devices[0].user_id == other.id


async def test_dead_device_is_removed_after_expo_reports_it(session, expo) -> None:
    user = await _user(session)
    expo.error = "DeviceNotRegistered"
    sent = await push_service.send_to_user(user.id, "t", "b", session)
    assert sent == 0
    assert (await session.execute(select(PushDevice))).scalars().all() == []


async def test_send_never_raises_when_expo_is_down(session, monkeypatch) -> None:
    user = await _user(session)

    async def boom(messages):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(push_service, "_post_expo", boom)
    assert await push_service.send_to_user(user.id, "t", "b", session) == 0


# ── Alertes budget ───────────────────────────────────────────────────────


async def test_budget_alert_fires_once_per_threshold(session, expo) -> None:
    user = await _user(session)
    cat = await _category(session, user, "1000")
    pairs = {(cat.id, "2026-03")}

    await _spend(session, user, cat, "500", date(2026, 3, 5))
    await notification_service.check_budget_alerts(user.id, pairs, session)
    assert expo.messages == []  # 50 % : rien

    await _spend(session, user, cat, "350", date(2026, 3, 8))  # 85 %
    await notification_service.check_budget_alerts(user.id, pairs, session)
    assert len(expo.messages) == 1 and "à 80 %" in expo.messages[0]["title"]

    await notification_service.check_budget_alerts(user.id, pairs, session)
    assert len(expo.messages) == 1  # pas de doublon

    await _spend(session, user, cat, "200", date(2026, 3, 9))  # 105 %
    await notification_service.check_budget_alerts(user.id, pairs, session)
    assert len(expo.messages) == 2 and "dépassé" in expo.messages[1]["title"]


async def test_budget_alert_jumping_straight_to_100_skips_the_80_message(session, expo) -> None:
    user = await _user(session)
    cat = await _category(session, user, "1000")
    await _spend(session, user, cat, "1200", date(2026, 3, 5))
    await notification_service.check_budget_alerts(user.id, {(cat.id, "2026-03")}, session)
    assert [m["title"] for m in expo.messages] == ["Budget « Transport » dépassé"]
    keys = (await session.execute(select(NotificationLog.key))).scalars().all()
    assert len(keys) == 2  # 80 et 100 réservés : pas de message 80 % tardif


async def test_budget_alert_respects_preference_and_missing_budget(session, expo) -> None:
    user = await _user(session, budget_alerts=False)
    cat = await _category(session, user, "1000")
    await _spend(session, user, cat, "2000", date(2026, 3, 5))
    await notification_service.check_budget_alerts(user.id, {(cat.id, "2026-03")}, session)
    assert expo.messages == []

    await push_service.update_preferences(
        user.id, NotificationPreferencesUpdate(budget_alerts=True), session
    )
    no_budget = await _category(session, user, None, name="Loisirs")
    await _spend(session, user, no_budget, "9999", date(2026, 3, 5))
    await notification_service.check_budget_alerts(user.id, {(no_budget.id, "2026-03")}, session)
    assert expo.messages == []


# ── Épargne ──────────────────────────────────────────────────────────────


async def test_savings_milestones_50_then_100(session, expo) -> None:
    user = await _user(session)
    goal_row = SavingsGoal(user_id=user.id, name="Voyage", target_amount=Decimal("1000"), deadline=date(2027, 1, 1))
    session.add(goal_row)
    await session.flush()
    goal = SimpleNamespace(id=goal_row.id)

    session.add(SavingsContribution(savings_goal_id=goal.id, amount=Decimal("600")))
    await session.commit()
    await notification_service.check_savings_milestone(user.id, goal.id, session)
    await notification_service.check_savings_milestone(user.id, goal.id, session)
    assert len(expo.messages) == 1 and "50 %" in expo.messages[0]["title"]

    session.add(SavingsContribution(savings_goal_id=goal.id, amount=Decimal("400")))
    await session.commit()
    await notification_service.check_savings_milestone(user.id, goal.id, session)
    assert len(expo.messages) == 2 and "atteint !" in expo.messages[1]["title"]


# ── Tâche planifiée ──────────────────────────────────────────────────────


class FakeProvider:
    def __init__(self, fallback: bool = False) -> None:
        self.fallback = fallback

    async def analyze(self, context: dict) -> dict:
        return {"summary": "Vos dépenses de transport augmentent.", "fallback": self.fallback}


async def test_daily_reminder_sent_once_and_only_if_nothing_logged(session, expo) -> None:
    await _user(session, daily_reminder=True, daily_reminder_hour=20, timezone="Africa/Douala")
    now = datetime(2026, 3, 4, 19, 5, tzinfo=timezone.utc)  # 20h05 à Douala (UTC+1)

    await notification_service.run_scheduled(now, session)
    await notification_service.run_scheduled(now, session)
    assert len(expo.messages) == 1 and expo.messages[0]["title"] == "Vos dépenses du jour"

    expo.messages.clear()
    other = await _user(session, daily_reminder=True, daily_reminder_hour=20, timezone="UTC")
    cat = await _category(session, other)
    await _spend(session, other, cat, "10", date(2026, 3, 4))
    await notification_service.run_scheduled(datetime(2026, 3, 4, 20, 5, tzinfo=timezone.utc), session)
    # Le second utilisateur a déjà noté une dépense aujourd'hui : pas de rappel pour lui.
    assert expo.messages == []


async def test_weekly_summary_and_ai_insight_on_sunday_evening(session, expo) -> None:
    user = await _user(session, timezone="UTC")
    cat = await _category(session, user)
    await _spend(session, user, cat, "300", date(2026, 3, 3))
    sunday = datetime(2026, 3, 8, 18, 30, tzinfo=timezone.utc)  # un dimanche

    await notification_service.run_scheduled(sunday, session, FakeProvider())
    titles = [m["title"] for m in expo.messages]
    assert "Votre résumé de la semaine" in titles
    assert "Le conseil de l'IA" in titles

    await notification_service.run_scheduled(sunday, session, FakeProvider())
    assert len(expo.messages) == len(titles)  # une seule fois par semaine


async def test_ai_fallback_is_not_pushed_and_off_day_sends_nothing(session, expo) -> None:
    await _user(session, timezone="UTC")
    await notification_service.run_scheduled(
        datetime(2026, 3, 4, 18, 30, tzinfo=timezone.utc), session, FakeProvider()
    )  # un mercredi
    assert expo.messages == []

    await notification_service.run_scheduled(
        datetime(2026, 3, 8, 19, 0, tzinfo=timezone.utc), session, FakeProvider(fallback=True)
    )
    assert [m["title"] for m in expo.messages] == ["Votre résumé de la semaine"]


# ── Rattrapage, budget du mois, rythme, épargne en pause ─────────────────


async def test_existing_overrun_is_caught_up_by_the_scheduler(session, expo) -> None:
    user = await _user(session, timezone="UTC")
    cat = await _category(session, user, budget="1000", name="Factures")
    await _spend(session, user, cat, "4982", date(2026, 3, 2))  # avant tout passage planifié
    noon = datetime(2026, 3, 4, 12, 0, tzinfo=timezone.utc)
    await notification_service.run_scheduled(noon, session)
    await notification_service.run_scheduled(noon, session)
    assert [m["title"] for m in expo.messages] == ["Budget « Factures » dépassé"]


async def test_scheduled_checks_stay_quiet_at_night(session, expo) -> None:
    user = await _user(session, timezone="UTC")
    cat = await _category(session, user, budget="1000")
    await _spend(session, user, cat, "4982", date(2026, 3, 2))
    await notification_service.run_scheduled(datetime(2026, 3, 4, 2, 0, tzinfo=timezone.utc), session)
    assert expo.messages == []


async def _accepted_budget(db: AsyncSession, user, period: str, total: str) -> None:
    db.add(Budget(user_id=user.id, period=period, recommended_total=Decimal(total),
                  recommended_savings=Decimal("0"), accepted_total=Decimal(total),
                  accepted_savings=Decimal("0"), rationale="test"))
    await db.commit()


async def test_month_budget_thresholds_and_pace_alert(session, expo) -> None:
    user = await _user(session, timezone="UTC")
    cat = await _category(session, user, budget=None)
    await _accepted_budget(session, user, "2026-04", "1000")

    # 12 avril (40 % du mois) : 650 dépensés = 65 % -> alerte de rythme, une seule fois
    await _spend(session, user, cat, "650", date(2026, 4, 2))
    day12 = datetime(2026, 4, 12, 10, 0, tzinfo=timezone.utc)
    await notification_service.run_scheduled(day12, session)
    await notification_service.run_scheduled(day12, session)
    assert [m["title"] for m in expo.messages] == ["Vous dépensez plus vite que prévu"]

    # 85 % puis 110 % : paliers du budget du mois
    await _spend(session, user, cat, "200", date(2026, 4, 12))
    await notification_service.run_scheduled(day12, session)
    await _spend(session, user, cat, "250", date(2026, 4, 12))
    await notification_service.run_scheduled(day12, session)
    titles = [m["title"] for m in expo.messages]
    assert titles[1:] == ["Budget du mois à 80 %", "Budget du mois dépassé"]


async def test_savings_goal_without_contribution_for_a_month_gets_one_reminder(session, expo) -> None:
    user = await _user(session, timezone="UTC")
    goal = SavingsGoal(user_id=user.id, name="Voyage", target_amount=Decimal("1200"), deadline=date(2026, 12, 31))
    session.add(goal)
    await session.flush()
    session.add(SavingsContribution(savings_goal_id=goal.id, amount=Decimal("100"),
                                    created_at=datetime(2026, 1, 10, tzinfo=timezone.utc)))
    await session.commit()

    now = datetime(2026, 3, 4, 12, 0, tzinfo=timezone.utc)
    await notification_service.run_scheduled(now, session)
    await notification_service.run_scheduled(now, session)
    assert len(expo.messages) == 1
    assert expo.messages[0]["title"] == "Objectif « Voyage » en pause"
    assert "par mois" in expo.messages[0]["body"]


# ── Routes ───────────────────────────────────────────────────────────────


async def test_routes_require_the_owner_and_store_preferences(expo, monkeypatch) -> None:
    from app.services import auth_service, mailer

    sent: list[str] = []

    async def fake_mail(to, subject, body):
        sent.append(body)

    monkeypatch.setattr(mailer, "send_email", fake_mail)
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def override_db():
        async with maker() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    try:
        async with maker() as db:
            user = User(name="Awa", currency="XAF", email="a@b.cc", password_hash="x")
            db.add(user)
            await db.flush()
            await db.commit()
            uid = user.id
            token = await auth_service._open_session(user, None, db)
        h = {"Authorization": f"Bearer {token}"}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            base = f"/api/v1/users/{uid}/notifications"
            assert (await c.get(f"{base}/preferences")).status_code == 401
            bad = await c.post(f"{base}/devices", json={"token": "not-a-token"}, headers=h)
            assert bad.status_code == 422
            ok = await c.post(
                f"{base}/devices", json={"token": TOKEN, "platform": "android", "timezone": "Africa/Douala"}, headers=h
            )
            assert ok.status_code == 204
            prefs = (await c.get(f"{base}/preferences", headers=h)).json()
            assert prefs["timezone"] == "Africa/Douala" and prefs["budget_alerts"] is True
            upd = await c.put(f"{base}/preferences", json={"daily_reminder": True, "daily_reminder_hour": 21}, headers=h)
            assert upd.json()["daily_reminder"] is True and upd.json()["daily_reminder_hour"] == 21
            assert (await c.put(f"{base}/preferences", json={"daily_reminder_hour": 30}, headers=h)).status_code == 422
            test = await c.post(f"{base}/test", headers=h)
            assert test.json() == {"sent": 1}
            gone = await c.post(f"{base}/devices/unregister", json={"token": TOKEN}, headers=h)
            assert gone.status_code == 204
            assert (await c.post(f"{base}/test", headers=h)).json() == {"sent": 0}
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
