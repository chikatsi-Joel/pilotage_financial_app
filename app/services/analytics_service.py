from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Budget,
    Category,
    CategoryAnalytics,
    Expense,
    Income,
    MonthlySnapshot,
    SavingsContribution,
    SavingsGoal,
)
from app.schemas.common import (
    CategoryAnalyticsRead,
    DashboardRead,
    ForecastRead,
    SavingsGoalSummary,
    TimeSeriesProfileRead,
    WeeklyExpenseRead,
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


async def _income_total(
    db: AsyncSession, user_id: UUID, start: date, end: date
) -> Decimal:
    """A recurring income is a monthly base; one-off incomes count in their own month only."""
    recurring_result = await db.execute(
        select(func.coalesce(func.sum(Income.amount), Decimal("0"))).where(
            Income.user_id == user_id,
            Income.active.is_(True),
            Income.recurring.is_(True),
            Income.income_date <= end,
        )
    )
    one_off_result = await db.execute(
        select(func.coalesce(func.sum(Income.amount), Decimal("0"))).where(
            Income.user_id == user_id,
            Income.active.is_(True),
            Income.recurring.is_(False),
            Income.income_date.between(start, end),
        )
    )
    return money(recurring_result.scalar_one()) + money(
        one_off_result.scalar_one()
    )


async def _contributions_total(
    db: AsyncSession, user_id: UUID, start: date, end: date
) -> Decimal:
    """Money already moved into savings goals during the period."""
    result = await db.execute(
        select(func.coalesce(func.sum(SavingsContribution.amount), Decimal("0")))
        .join(SavingsGoal)
        .where(
            SavingsGoal.user_id == user_id,
            SavingsContribution.created_at >= start,
            SavingsContribution.created_at < end + timedelta(days=1),
        )
    )
    return money(result.scalar_one())


def _shift_period(period: str) -> str:
    year, month = map(int, period.split("-"))
    if month == 1:
        return f"{year - 1}-12"
    return f"{year}-{month - 1:02d}"


def _weekly_bands(
    year: int, month: int, end_day: int
) -> list[tuple[str, date, date]]:
    return [
        ("S1", date(year, month, 1), date(year, month, 7)),
        ("S2", date(year, month, 8), date(year, month, 14)),
        ("S3", date(year, month, 15), date(year, month, 21)),
        ("S4", date(year, month, 22), date(year, month, end_day)),
    ]


async def _dashboard_extra(
    user_id: UUID,
    period: str,
    db: AsyncSession,
    current_savings: Decimal,
) -> tuple[
    list[WeeklyExpenseRead],
    list[float],
    Decimal | None,
    SavingsGoalSummary | None,
]:
    start, end = month_bounds(period)
    year, month = map(int, period.split("-"))
    bands = _weekly_bands(year, month, end.day)

    # Agrégation côté DB (GROUP BY jour) au lieu de rapatrier chaque dépense
    expense_rows = (
        await db.execute(
            select(Expense.expense_date, func.sum(Expense.amount))
            .where(
                Expense.user_id == user_id,
                Expense.expense_date.between(start, end),
            )
            .group_by(Expense.expense_date)
        )
    ).all()

    # Précalcul jour -> bande, une seule fois (au lieu d'un scan des bandes
    # par dépense : O(n * bands) -> O(jours_du_mois))
    day_to_band: dict[int, str] = {}
    for label, w_start, w_end in bands:
        d = w_start
        while d <= w_end:
            day_to_band[d.day] = label
            d += timedelta(days=1)

    daily: list[Decimal] = [Decimal("0")] * end.day
    weekly_reel: dict[str, Decimal] = {label: Decimal("0") for label, _, _ in bands}
    for expense_date, total in expense_rows:
        daily[expense_date.day - 1] = total
        label = day_to_band.get(expense_date.day)
        if label:
            weekly_reel[label] += total

    budget_row = (
        await db.execute(
            select(Budget).where(
                Budget.user_id == user_id,
                Budget.period == period,
            )
        )
    ).scalar_one_or_none()
    prevu_total = (
        (budget_row.accepted_total or budget_row.recommended_total)
        if budget_row is not None
        else Decimal("0")
    )

    # Généralisé au nombre réel de bandes (bug : l'original supposait
    # toujours 4 bandes, ce qui plante en index si un mois a 5 semaines)
    n_bands = len(bands)
    base = (prevu_total / Decimal(n_bands)).quantize(Decimal("0.01"))
    weekly_prevu = [base] * (n_bands - 1) + [prevu_total - base * (n_bands - 1)]

    weekly = [
        WeeklyExpenseRead(
            label=label,
            prevu=weekly_prevu[i],
            reel=money(weekly_reel[label]),
        )
        for i, (label, _, _) in enumerate(bands)
    ]

    # income + expense du mois précédent en un seul aller-retour (UNION ALL)
    prev_start, prev_end = month_bounds(_shift_period(period))
    prev_income = await _income_total(db, user_id, prev_start, prev_end)
    prev_expense = await _sum_amount(
        db, Expense, user_id, Expense.expense_date,
        prev_start, prev_end,
    )
    prev_savings = prev_income - prev_expense

    monthly_variation = (
        (
            (current_savings - prev_savings)
            / abs(prev_savings)
            * Decimal("100")
        ).quantize(Decimal("0.00001"))
        if prev_savings != 0
        else None
    )

    # Goals + total des contributions en une seule requête (LEFT JOIN + GROUP BY)
    # au lieu de : SELECT goals, puis SELECT SUM(...) IN (goal_ids)
    goal_rows = (
        await db.execute(
            select(
                SavingsGoal,
                func.coalesce(func.sum(SavingsContribution.amount), Decimal("0")),
            )
            .outerjoin(
                SavingsContribution,
                SavingsContribution.savings_goal_id == SavingsGoal.id,
            )
            .where(
                SavingsGoal.user_id == user_id,
                SavingsGoal.active.is_(True),
            )
            .group_by(SavingsGoal.id)
        )
    ).all()

    savings_goal = None
    if goal_rows:
        best_goal, current_amount = max(goal_rows, key=lambda r: r[1])
        savings_goal = SavingsGoalSummary(
            name=best_goal.name,
            target_amount=best_goal.target_amount,
            current_amount=money(current_amount),
            progress_percentage=(
                float(current_amount / best_goal.target_amount)
                if best_goal.target_amount
                else 0.0
            ),
        )

    return (
        weekly,
        [float(x) for x in daily],
        monthly_variation,
        savings_goal,
    )

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

    income_total = await _income_total(db, user_id, start, end)
    expense_total = await _sum_amount(
        db, Expense, user_id, Expense.expense_date,
        start, end,
    )
    savings = income_total - expense_total
    contributions = await _contributions_total(db, user_id, start, end)
    remaining = income_total - expense_total - contributions
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

    weekly, sparkline, monthly_variation, savings_goal = (
        await _dashboard_extra(
            user_id, period, db, money(savings)
        )
    )

    return DashboardRead(
        period=period,
        income=money(income_total),
        expenses=money(expense_total),
        savings=money(savings),
        remaining_balance=money(remaining),
        contributions=money(contributions),
        savings_rate=savings_rate,
        categories_in_drift=len(drifts),
        potential_savings=money(
            sum(
                (x.potential_saving for x in analytics),
                0.0,
            )
        ),
        top_drift_categories=drifts[:5],
        weekly=weekly,
        sparkline=sparkline,
        monthly_variation=monthly_variation,
        savings_goal=savings_goal,
    )


async def refresh_analytics(
    user_id: UUID, period: str, db: AsyncSession
) -> dict:
    start, end = month_bounds(period)

    analytics = await compute_category_analytics(
        user_id, period, db
    )

    income = await _income_total(db, user_id, start, end)
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
            profile_data=_profile_to_dict(p)
            | {
                "essential": a.essential,
                "opportunity_score": a.opportunity_score,
            },
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
    income = await _income_total(db, user_id, start, end)
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
    category: Category | None = None,
) -> CategoryAnalyticsRead:
    """Reconstruit la lecture analytics depuis le cache.

    `essential` et `opportunity_score` sont persistés dans `profile_data` ;
    pour les anciennes lignes sans ces clés, on retombe sur la catégorie.
    """
    p = row.profile_data or {}
    if "essential" in p:
        essential = bool(p["essential"])
    else:
        essential = (
            category is not None
            and category.essentiality.value == "ESSENTIAL"
        )
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
        name=category.name if category else "",
        description="",
        period=row.period,
        essential=essential,
        current_amount=float(row.current_amount),
        baseline_amount=float(row.baseline) if row.baseline else 0.0,
        expected_amount=float(row.current_amount - row.deviation),
        variation_percentage=(
            float(row.deviation / row.baseline * 100)
            if row.baseline
            else 0.0
        ),
        potential_saving=float(row.estimated_saving),
        opportunity_score=float(p.get("opportunity_score", 0.0)),
        profile=profile,
    )


async def get_category_analytics_snapshot(
    user_id: UUID, period: str, db: AsyncSession, _attempts: int = 0
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
        cats = {c.id: c for c in cat_result.scalars().all()}

        return [
            _snapshot_to_category_read(row, cats.get(row.category_id))
            for row in rows
        ]

    if _attempts >= 1:
        return []

    await refresh_analytics(user_id, period, db)
    return await get_category_analytics_snapshot(
        user_id, period, db, _attempts + 1
    )


async def get_dashboard_snapshot(
    user_id: UUID, period: str, db: AsyncSession, _attempts: int = 0
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
            cat_by_id = {c.id: c for c in cat_result.scalars().all()}

            reads = [
                _snapshot_to_category_read(row, cat_by_id.get(row.category_id))
                for row in cats
            ]

            drifts = [
                x for x in reads
                if x.profile.drift_score >= 0.5
            ]
            drifts.sort(
                key=lambda x: x.profile.drift_score, reverse=True
            )

            start, end = month_bounds(period)
            live_income = await _income_total(db, user_id, start, end)
            live_expense = await _sum_amount(
                db, Expense, user_id, Expense.expense_date,
                start, end,
            )
            live_savings = live_income - live_expense
            live_contrib = await _contributions_total(
                db, user_id, start, end
            )
            live_remaining = live_income - live_expense - live_contrib
            live_rate = (
                (live_savings / live_income).quantize(
                    Decimal("0.00001")
                )
                if live_income
                else Decimal("0")
            )

            weekly, sparkline, monthly_variation, savings_goal = (
                await _dashboard_extra(
                    user_id, period, db, money(live_savings)
                )
            )

            return DashboardRead(
                period=period,
                income=money(live_income),
                expenses=money(live_expense),
                savings=money(live_savings),
                remaining_balance=money(live_remaining),
                contributions=money(live_contrib),
                savings_rate=live_rate,
                categories_in_drift=len(drifts),
                potential_savings=money(
                    sum(
                        (x.potential_saving for x in reads),
                        0.0,
                    )
                ),
                top_drift_categories=drifts[:5],
                weekly=weekly,
                sparkline=sparkline,
                monthly_variation=monthly_variation,
                savings_goal=savings_goal,
            )

    if _attempts >= 1:
        return DashboardRead(
            period=period,
            income=money(0),
            expenses=money(0),
            savings=money(0),
            remaining_balance=money(0),
            contributions=money(0),
            savings_rate=0.0,
            categories_in_drift=0,
            potential_savings=money(0),
            top_drift_categories=[],
            weekly=[],
            sparkline=[],
            monthly_variation=0.0,
            savings_goal=None,
        )

    await refresh_analytics(user_id, period, db)
    return await get_dashboard_snapshot(user_id, period, db, _attempts + 1)
