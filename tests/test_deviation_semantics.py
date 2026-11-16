"""Sémantique des écarts par catégorie (habitude, dépense attendue, variation).

- l'habitude se calcule sur les mois PRÉCÉDENTS (mois sans dépense à 0) ;
- le mois en cours se compare aux mois passés À LA MÊME DATE ;
- le cache renvoie exactement la même variation qu'un recalcul.
"""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models import Category, CategoryAnalytics, Expense, MonthlySnapshot, User
from app.models.entities import Essentiality, OptimizationPotential
from app.services import analytics_service
from app.services.analytics import FinancialAnalyticsEngine
from app.services.analytics.models import Category as DomainCategory
from app.services.analytics.models import CategoryType
from app.services.analytics.models import OptimizationPotential as DomainPotential
from app.services.analytics.statistics import relative_gap

CAT = DomainCategory(
    id="c",
    name="Courses",
    description="",
    type=CategoryType.NON_ESSENTIAL,
    optimization_potential=DomainPotential.HIGH,
)
engine = FinancialAnalyticsEngine()


def analyse(monthly, period, to_date=None, day=None):
    return engine.analyze_category_monthly(CAT, monthly, *period, to_date, day)


# ── Moteur ──────────────────────────────────────────────────────────────────


def test_closed_month_is_compared_to_previous_months_only():
    r = analyse({(2026, 1): 100, (2026, 2): 100, (2026, 3): 100, (2026, 4): 150}, (2026, 4))
    assert r.baseline_amount == pytest.approx(100)
    assert r.expected_amount == pytest.approx(100)
    assert r.variation_percentage == pytest.approx(50)


def test_running_month_is_compared_at_the_same_date():
    full = {(2026, 1): 100, (2026, 2): 100, (2026, 3): 100, (2026, 4): 30}
    to_date = {(2026, 1): 30, (2026, 2): 30, (2026, 3): 30, (2026, 4): 30}
    r = analyse(full, (2026, 4), to_date, 10)
    assert r.baseline_amount == pytest.approx(100)  # habitude du mois complet (affichée)
    assert r.expected_amount == pytest.approx(30)
    assert r.variation_percentage == pytest.approx(0)


def test_rent_paid_on_the_first_is_not_a_spike_on_the_second():
    full = {(2026, m): 100 for m in range(1, 5)}
    to_date = {(2026, m): 100 for m in range(1, 5)}  # tout est payé le 1er
    r = analyse(full, (2026, 4), to_date, 2)
    assert r.variation_percentage == pytest.approx(0)
    assert r.potential_saving == 0


def test_no_history_means_no_variation():
    r = analyse({(2026, 4): 80}, (2026, 4))
    assert (r.baseline_amount, r.expected_amount, r.variation_percentage) == (0, 0, 0)
    r = analyse({(2026, 4): 80}, (2026, 4), {(2026, 4): 80}, 12)
    assert r.variation_percentage == 0


def test_habit_uses_only_months_where_the_category_is_used():
    # Dépenses en janvier et en avril seulement : l'habitude porte sur ces deux mois.
    r = analyse({(2026, 1): 120, (2026, 4): 120, (2026, 5): 120}, (2026, 5))
    assert r.baseline_amount == pytest.approx(120)
    assert r.variation_percentage == pytest.approx(0)


def test_a_missing_previous_month_does_not_create_a_false_alert():
    monthly = {(2026, m): 100 for m in (1, 2, 3, 4, 6)}  # mai sans dépense
    r = analyse(monthly, (2026, 6))
    assert r.variation_percentage == pytest.approx(0)


def test_to_date_on_day_31_covers_short_months():
    full = {(2026, 2): 90, (2026, 4): 90, (2026, 5): 90}
    r = analyse(full, (2026, 5), dict(full), 31)
    assert r.expected_amount == pytest.approx(r.baseline_amount)


def test_relative_gap():
    assert relative_gap(120, 100) == pytest.approx(20)
    assert relative_gap(50, 0) == 0


def test_as_of_day():
    today = date(2026, 11, 16)
    assert analytics_service.as_of_day("2026-10", today) is None  # clôturé
    assert analytics_service.as_of_day("2026-11", today) == 16
    assert analytics_service.as_of_day("2026-12", today) == 0  # futur


# ── Service, cache ──────────────────────────────────────────────────────────


@pytest.fixture
async def maker():
    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield async_sessionmaker(eng, expire_on_commit=False)
    await eng.dispose()


async def _seed(db: AsyncSession, amounts: dict[date, int]) -> tuple[User, Category]:
    user = User(name="S", currency="XAF", email="s@x.io", password_hash="x")
    db.add(user)
    await db.flush()
    cat = Category(
        user_id=user.id,
        name="Courses",
        essentiality=Essentiality.NON_ESSENTIAL,
        optimization_potential=OptimizationPotential.HIGH,
    )
    db.add(cat)
    await db.flush()
    for day, amount in amounts.items():
        db.add(
            Expense(user_id=user.id, category_id=cat.id, amount=Decimal(amount), expense_date=day)
        )
    await db.commit()
    return user, cat


SIX_MONTHS = {
    date(2026, 5, 3): 90_000,
    date(2026, 5, 20): 40_000,
    date(2026, 6, 4): 100_000,
    date(2026, 6, 25): 30_000,
    date(2026, 7, 2): 80_000,
    date(2026, 8, 9): 120_000,
    date(2026, 8, 28): 10_000,
    date(2026, 9, 5): 95_000,
    date(2026, 10, 3): 300_000,
}


async def test_cache_and_recompute_give_the_same_variation(maker):
    today = date(2026, 11, 16)
    async with maker() as db:
        user, _ = await _seed(db, SIX_MONTHS | {date(2026, 11, 8): 70_000})
        for period in ("2026-10", "2026-11"):
            fresh = await analytics_service.compute_category_analytics(user.id, period, db, today)
            await analytics_service.refresh_analytics(user.id, period, db, today)
            load = analytics_service._load_cached_analytics
            cached = await load(user.id, period, db, today=today)
            assert cached is not None
            assert cached[0].expected_amount == pytest.approx(fresh[0].expected_amount, abs=0.01)
            assert cached[0].variation_percentage == pytest.approx(
                fresh[0].variation_percentage, abs=1e-6
            )


async def test_large_deviation_is_stored(maker):
    """Écart de 5 000 000 XAF : ne déborde plus (colonne deviation en Numeric(18,2))."""
    async with maker() as db:
        user, _ = await _seed(db, {date(2026, 8, 1): 100_000, date(2026, 9, 1): 5_100_000})
        await analytics_service.refresh_analytics(user.id, "2026-09", db, date(2026, 11, 16))
        row = (await db.execute(select(CategoryAnalytics))).scalar_one()
        assert row.deviation == Decimal("5000000.00")
    col = CategoryAnalytics.__table__.c.deviation.type
    assert (col.precision, col.scale) == (18, 2)


async def test_stale_rows_are_recomputed(maker):
    async with maker() as db:
        user, _ = await _seed(db, SIX_MONTHS | {date(2026, 11, 8): 70_000})
        today = date(2026, 11, 16)
        for period in ("2026-10", "2026-11"):
            await analytics_service.refresh_analytics(user.id, period, db, today)
        load = analytics_service._load_cached_analytics
        # Mois clôturé : valide les jours suivants.
        assert await load(user.id, "2026-10", db, today=date(2026, 11, 20)) is not None
        # Mois en cours calculé hier : à recalculer.
        assert await load(user.id, "2026-11", db, today=date(2026, 11, 17)) is None
        # Ancienne sémantique : à recalculer.
        row = (
            await db.execute(select(CategoryAnalytics).where(CategoryAnalytics.period == "2026-10"))
        ).scalar_one()
        row.profile_data = {k: v for k, v in row.profile_data.items() if k != "semantics"}
        await db.commit()
        assert await load(user.id, "2026-10", db, today=today) is None


async def test_expense_in_a_past_month_invalidates_later_months(maker):
    async with maker() as db:
        user, cat = await _seed(db, SIX_MONTHS)
        today = date(2026, 11, 16)
        for period in ("2026-09", "2026-10", "2026-11"):
            await analytics_service.refresh_analytics(user.id, period, db, today)
        db.add(
            Expense(
                user_id=user.id,
                category_id=cat.id,
                amount=Decimal(5000),
                expense_date=date(2026, 9, 10),
            )
        )
        await analytics_service.invalidate_snapshots(user.id, "2026-09", db)
        periods = set((await db.execute(select(CategoryAnalytics.period))).scalars())
        snapshots = set((await db.execute(select(MonthlySnapshot.period))).scalars())
        assert "2026-10" not in periods and "2026-11" not in periods
        assert snapshots == {"2026-09"}
