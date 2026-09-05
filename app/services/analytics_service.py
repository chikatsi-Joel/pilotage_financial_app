from __future__ import annotations

from calendar import monthrange
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Category,
    CategoryAnalytics,
    Expense,
    Income,
    MonthlySnapshot,
)
from app.schemas.common import (
    CategoryAnalyticsRead,
    DashboardRead,
    ForecastRead,
    TimeSeriesProfileRead,
)
from app.services.analytics import FinancialAnalyticsEngine, money
from app.services.analytics.models import Category as DomainCategory
from app.services.analytics.models import (
    CategoryType,
    OptimizationPotential,
)
from app.services.analytics.models import Expense as DomainExpense

_engine = FinancialAnalyticsEngine()


class InvalidPeriod(Exception):
    pass


def month_bounds(period: str) -> tuple[date, date]:
    try:
        year, month = map(int, period.split("-"))
    except (ValueError, TypeError) as exc:
        raise InvalidPeriod("period must be YYYY-MM") from exc
    first = date(year, month, 1)
    last = date(year, month, monthrange(year, month)[1])
    return first, last


def _to_domain_category(c: Category) -> DomainCategory:
    return DomainCategory(
        id=str(c.id),
        name=c.name,
        description="",
        type=(
            CategoryType.ESSENTIAL
            if c.essentiality.value == "ESSENTIAL"
            else CategoryType.NON_ESSENTIAL
        ),
        optimization_potential=OptimizationPotential(
            c.optimization_potential.value.lower()
        ),
    )


def _to_domain_expenses(
    expenses: list[Expense],
) -> list[DomainExpense]:
    return [
        DomainExpense(
            amount=e.amount,
            date=e.expense_date,
            category_id=str(e.category_id),
        )
        for e in expenses
    ]


def _profile_to_dict(profile) -> dict:
    return {
        "level": profile.level,
        "trend": profile.trend,
        "seasonality_strength": profile.seasonality_strength,
        "seasonality_reliable": profile.seasonality_reliable,
        "volatility": profile.volatility,
        "anomaly_score": profile.anomaly_score,
        "change_points": profile.change_points,
        "drift_score": profile.drift_score,
        "confidence": profile.confidence,
        "forecast": {
            "method": profile.forecast.method,
            "value": profile.forecast.value,
            "mae": profile.forecast.mae,
        },
    }


async def _sum_amount(
    db: AsyncSession,
    model,
    user_id: UUID,
    date_col,
    start: date,
    end: date,
) -> Decimal:
    result = await db.execute(
        select(model.amount).where(
            model.user_id == user_id,
            date_col.between(start, end),
        )
    )
    return sum(result.scalars().all(), Decimal("0"))


async def compute_category_analytics(
    user_id: UUID, period: str, db: AsyncSession
) -> list[CategoryAnalyticsRead]:
    year, month = map(int, period.split("-"))
    _, current_end = month_bounds(period)

    category_result = await db.execute(
        select(Category)
        .where(
            Category.user_id == user_id,
            Category.active.is_(True),
        )
        .order_by(Category.name)
    )
    categories = [
        _to_domain_category(c)
        for c in category_result.scalars().all()
    ]

    expense_result = await db.execute(
        select(Expense).where(
            Expense.user_id == user_id,
            Expense.expense_date <= current_end,
        )
    )
    domain_expenses = _to_domain_expenses(expense_result.scalars().all())

    results = _engine.analyze(
        categories, domain_expenses, year, month
    )

    return [
        CategoryAnalyticsRead(
            category_id=UUID(r.category_id),
            name=r.name,
            description=r.description,
            period=period,
            essential=r.essential,
            current_amount=r.current_amount,
            baseline_amount=r.baseline_amount,
            expected_amount=r.expected_amount,
            variation_percentage=r.variation_percentage,
            potential_saving=r.potential_saving,
            opportunity_score=r.opportunity_score,
            profile=_profile_to_dict(r.profile),
        )
        for r in results
    ]


async def get_dashboard(
    user_id: UUID, period: str, db: AsyncSession
) -> DashboardRead:
    start, end = month_bounds(period)

    income_total = await _sum_amount(
        db, Income, user_id, Income.income_date,
        start, end,
    )
    expense_total = await _sum_amount(
        db, Expense, user_id, Expense.expense_date,
        start, end,
    )
    savings = income_total - expense_total
    savings_rate = (
        (savings / income_total).quantize(
            Decimal("0.00001")
        )
        if income_total
        else Decimal("0")
    )

    analytics = await compute_category_analytics(
        user_id, period, db
    )
    drifts = [
        x for x in analytics
        if x.profile.drift_score >= 0.5
    ]
    drifts.sort(
        key=lambda x: x.profile.drift_score, reverse=True
    )

    return DashboardRead(
        period=period,
        income=money(income_total),
        expenses=money(expense_total),
        savings=money(savings),
        savings_rate=savings_rate,
        categories_in_drift=len(drifts),
        potential_savings=money(
            sum(
                (x.potential_saving for x in analytics),
                0.0,
            )
        ),
        top_drift_categories=drifts[:5],
    )


async def refresh_analytics(
    user_id: UUID, period: str, db: AsyncSession
) -> dict:
    start, end = month_bounds(period)

    analytics = await compute_category_analytics(
        user_id, period, db
    )

    income = await _sum_amount(
        db, Income, user_id, Income.income_date,
        start, end,
    )
    expense = await _sum_amount(
        db, Expense, user_id, Expense.expense_date,
        start, end,
    )
    savings = income - expense
    rate = (savings / income) if income else Decimal("0")

    snapshot_result = await db.execute(
        select(MonthlySnapshot).where(
            MonthlySnapshot.user_id == user_id,
            MonthlySnapshot.period == period,
        )
    )
    snapshot = snapshot_result.scalar_one_or_none()
    if snapshot is None:
        snapshot = MonthlySnapshot(
            user_id=user_id,
            period=period,
            income=money(income),
            expenses=money(expense),
            savings=money(savings),
            savings_rate=rate,
        )
        db.add(snapshot)
    else:
        snapshot.income = money(income)
        snapshot.expenses = money(expense)
        snapshot.savings = money(savings)
        snapshot.savings_rate = rate

    for a in analytics:
        existing_result = await db.execute(
            select(CategoryAnalytics).where(
                CategoryAnalytics.user_id == user_id,
                CategoryAnalytics.category_id
                == a.category_id,
                CategoryAnalytics.period == period,
            )
        )
        existing = (
            existing_result.scalar_one_or_none()
        )
        p = a.profile
        values = dict(
            user_id=user_id,
            category_id=a.category_id,
            period=period,
            baseline=money(a.baseline_amount),
            trend=Decimal(str(p.trend)),
            volatility=Decimal(str(p.volatility)),
            deviation=Decimal(
                str(a.current_amount - a.expected_amount)
            ),
            frequency=0,
            confidence=(
                "HIGH" if p.confidence >= 0.75
                else (
                    "MEDIUM"
                    if p.confidence >= 0.25
                    else "LOW"
                )
            ),
            trend_direction=(
                "INCREASING" if p.trend > 0.05
                else (
                    "DECREASING"
                    if p.trend < -0.05
                    else "STABLE"
                )
            ),
            drift_signal=(
                "STRONG_DRIFT" if p.drift_score >= 0.8
                else (
                    "ATTENTION"
                    if p.drift_score >= 0.5
                    else "NORMAL"
                )
            ),
            current_amount=money(a.current_amount),
            estimated_saving=money(a.potential_saving),
            profile_data=_profile_to_dict(p),
        )
        if existing is None:
            db.add(CategoryAnalytics(**values))
        else:
            for key, value in values.items():
                if key not in {
                    "user_id",
                    "category_id",
                    "period",
                }:
                    setattr(existing, key, value)

    await db.commit()

    return {
        "period": period,
        "snapshot": {
            "income": money(income),
            "expenses": money(expense),
            "savings": money(savings),
            "savings_rate": rate,
        },
        "categories": len(analytics),
    }


async def get_period_totals(
    user_id: UUID, period: str, db: AsyncSession
) -> tuple[Decimal, Decimal]:
    start, end = month_bounds(period)
    income = await _sum_amount(
        db, Income, user_id, Income.income_date,
        start, end,
    )
    expense = await _sum_amount(
        db, Expense, user_id, Expense.expense_date,
        start, end,
    )
    return income, expense


async def invalidate_snapshots(
    user_id: UUID, period: str, db: AsyncSession
) -> None:
    await db.execute(
        delete(CategoryAnalytics).where(
            CategoryAnalytics.user_id == user_id,
            CategoryAnalytics.period == period,
        )
    )
    await db.execute(
        delete(MonthlySnapshot).where(
            MonthlySnapshot.user_id == user_id,
            MonthlySnapshot.period == period,
        )
    )
    await db.flush()
    await refresh_analytics(user_id, period, db)


def _snapshot_to_category_read(
    row: CategoryAnalytics,
) -> CategoryAnalyticsRead:
    p = row.profile_data or {}
    forecast = p.get("forecast", {})
    profile = TimeSeriesProfileRead(
        level=p.get("level", 0.0),
        trend=p.get("trend", 0.0),
        seasonality_strength=p.get("seasonality_strength", 0.0),
        seasonality_reliable=p.get("seasonality_reliable", False),
        volatility=p.get("volatility", 0.0),
        anomaly_score=p.get("anomaly_score", 0.0),
        change_points=tuple(p.get("change_points", [])),
        drift_score=p.get("drift_score", 0.0),
        confidence=p.get("confidence", 0.0),
        forecast=ForecastRead(
            method=forecast.get("method", "ewma"),
            value=forecast.get("value", 0.0),
            mae=forecast.get("mae"),
        ),
    )
    return CategoryAnalyticsRead(
        category_id=row.category_id,
        name="",
        description="",
        period=row.period,
        essential=row.trend_direction is not None,
        current_amount=float(row.current_amount),
        baseline_amount=float(row.baseline) if row.baseline else 0.0,
        expected_amount=float(row.current_amount - row.deviation),
        variation_percentage=(
            float(row.deviation / row.baseline * 100)
            if row.baseline
            else 0.0
        ),
        potential_saving=float(row.estimated_saving),
        opportunity_score=0.0,
        profile=profile,
    )


async def get_category_analytics_snapshot(
    user_id: UUID, period: str, db: AsyncSession
) -> list[CategoryAnalyticsRead]:
    result = await db.execute(
        select(CategoryAnalytics).where(
            CategoryAnalytics.user_id == user_id,
            CategoryAnalytics.period == period,
        )
    )
    rows = result.scalars().all()

    if rows and all(r.profile_data is not None for r in rows):
        cat_result = await db.execute(
            select(Category).where(
                Category.user_id == user_id,
            )
        )
        names = {c.id: c.name for c in cat_result.scalars().all()}

        reads = []
        for row in rows:
            r = _snapshot_to_category_read(row)
            r.name = names.get(row.category_id, "")
            reads.append(r)
        return reads

    await refresh_analytics(user_id, period, db)
    return await get_category_analytics_snapshot(user_id, period, db)


async def get_dashboard_snapshot(
    user_id: UUID, period: str, db: AsyncSession
) -> DashboardRead:
    snapshot_result = await db.execute(
        select(MonthlySnapshot).where(
            MonthlySnapshot.user_id == user_id,
            MonthlySnapshot.period == period,
        )
    )
    snapshot = snapshot_result.scalar_one_or_none()

    if snapshot is not None:
        cats_result = await db.execute(
            select(CategoryAnalytics).where(
                CategoryAnalytics.user_id == user_id,
                CategoryAnalytics.period == period,
            )
        )
        cats = cats_result.scalars().all()

        if all(c.profile_data is not None for c in cats):
            cat_result = await db.execute(
                select(Category).where(
                    Category.user_id == user_id,
                )
            )
            names = {c.id: c.name for c in cat_result.scalars().all()}

            reads = []
            for row in cats:
                r = _snapshot_to_category_read(row)
                r.name = names.get(row.category_id, "")
                reads.append(r)

            drifts = [
                x for x in reads
                if x.profile.drift_score >= 0.5
            ]
            drifts.sort(
                key=lambda x: x.profile.drift_score, reverse=True
            )

            return DashboardRead(
                period=period,
                income=snapshot.income,
                expenses=snapshot.expenses,
                savings=snapshot.savings,
                savings_rate=snapshot.savings_rate,
                categories_in_drift=len(drifts),
                potential_savings=money(
                    sum(
                        (x.potential_saving for x in reads),
                        0.0,
                    )
                ),
                top_drift_categories=drifts[:5],
            )

    await refresh_analytics(user_id, period, db)
    return await get_dashboard_snapshot(user_id, period, db)
