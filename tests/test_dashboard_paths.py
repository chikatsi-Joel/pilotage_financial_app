"""Le dashboard « direct » et le dashboard « cache » doivent rester équivalents."""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.models import (
    Category,
    Essentiality,
    Expense,
    Income,
    OptimizationPotential,
    User,
)
from app.services import analytics_service

PERIOD = "2026-03"


@pytest.fixture
async def session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        yield db
    await engine.dispose()


async def _seed(db: AsyncSession) -> User:
    user = User(name="Test", currency="XAF")
    db.add(user)
    await db.flush()
    food = Category(
        user_id=user.id,
        name="Food",
        essentiality=Essentiality.ESSENTIAL,
        optimization_potential=OptimizationPotential.LOW,
    )
    fun = Category(
        user_id=user.id,
        name="Fun",
        essentiality=Essentiality.NON_ESSENTIAL,
        optimization_potential=OptimizationPotential.HIGH,
    )
    db.add_all([food, fun])
    await db.flush()
    db.add(Income(user_id=user.id, amount=Decimal("1000"), income_date=date(2026, 1, 1), source="Job", recurring=True))
    for month in (1, 2, 3):
        db.add(Expense(user_id=user.id, category_id=food.id, amount=Decimal("200"), expense_date=date(2026, month, 5)))
        db.add(Expense(user_id=user.id, category_id=fun.id, amount=Decimal("50") * month, expense_date=date(2026, month, 20)))
    await db.commit()
    return user


async def test_cached_dashboard_matches_live_dashboard(session: AsyncSession) -> None:
    user = await _seed(session)

    live = await analytics_service.get_dashboard(user.id, PERIOD, session)
    first = await analytics_service.get_dashboard_snapshot(user.id, PERIOD, session)  # remplit le cache
    cached = await analytics_service.get_dashboard_snapshot(user.id, PERIOD, session)  # lit le cache

    assert first == cached
    assert cached.income == live.income == Decimal("1000.00")
    assert cached.expenses == live.expenses == Decimal("350.00")
    assert cached.remaining_balance == live.remaining_balance
    assert cached.savings_rate == live.savings_rate
    assert cached.categories_in_drift == live.categories_in_drift
    assert len(cached.weekly) == len(live.weekly) == 4


async def test_category_snapshot_matches_live_analytics(session: AsyncSession) -> None:
    user = await _seed(session)

    live = {c.name: c for c in await analytics_service.compute_category_analytics(user.id, PERIOD, session)}
    cached = {c.name: c for c in await analytics_service.get_category_analytics_snapshot(user.id, PERIOD, session)}
    again = {c.name: c for c in await analytics_service.get_category_analytics_snapshot(user.id, PERIOD, session)}

    assert set(live) == set(cached) == set(again) == {"Food", "Fun"}
    for name, expected in live.items():
        for got in (cached[name], again[name]):
            assert got.essential == expected.essential
            assert got.current_amount == pytest.approx(expected.current_amount)
            assert got.opportunity_score == pytest.approx(expected.opportunity_score)


async def test_dashboard_without_categories_does_not_loop(session: AsyncSession) -> None:
    user = User(name="Empty", currency="XAF")
    session.add(user)
    await session.commit()

    dashboard = await analytics_service.get_dashboard_snapshot(user.id, PERIOD, session)

    assert dashboard.expenses == Decimal("0.00")
    assert dashboard.top_drift_categories == []


async def test_ai_analyze_handles_float_dashboard_and_decimal_contributions(
    session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Régression : `dash.savings` (float) moins les contributions (Decimal) → TypeError 500."""
    from app.api.routers import ai as ai_router

    captured: dict = {}

    class FakeProvider:
        async def analyze(self, context: dict) -> dict:
            captured.update(context)
            return {"summary": "ok", "alerts": [], "recommendations": [], "projected_impact": {}}

    monkeypatch.setattr(ai_router, "get_ai_provider", lambda: FakeProvider())
    user = await _seed(session)

    result = await ai_router.analyze_period(PERIOD, user, session)

    assert result.summary == "ok"
    assert captured["savings"]["unallocated_monthly_savings"] == "650.00"
