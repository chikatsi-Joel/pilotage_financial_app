from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import Select, and_, case, delete, extract, func, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from app.core.config import settings
from app.db.upsert import upsert
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
from app.services.periods import month_bounds, parse_period, shift_period

_engine = FinancialAnalyticsEngine()


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
        "history_months": profile.history_months,
        "last_change": profile.last_change,
        "forecast": {
            "method": profile.forecast.method,
            "value": profile.forecast.value,
            "mae": profile.forecast.mae,
        },
    }


def _income_sum(start: date, end: date) -> ColumnElement[Decimal]:
    """SUM des revenus d'un mois : un revenu récurrent est une base mensuelle (compté dès
    qu'il a commencé), un revenu ponctuel ne compte que dans son propre mois."""
    return func.coalesce(
        func.sum(
            case(
                (
                    and_(Income.recurring.is_(True), Income.income_date <= end),
                    Income.amount,
                ),
                (
                    and_(
                        Income.recurring.is_(False),
                        Income.income_date.between(start, end),
                    ),
                    Income.amount,
                ),
                else_=0,
            )
        ),
        0,
    )


def _expense_sum(start: date, end: date) -> ColumnElement[Decimal]:
    """SUM des dépenses comprises entre start et end (inclus)."""
    return func.coalesce(
        func.sum(
            case((Expense.expense_date.between(start, end), Expense.amount), else_=0)
        ),
        0,
    )


def _period_totals_query(
    user_id: UUID, months: list[tuple[date, date]]
) -> Select:
    """Une seule requête : revenus puis dépenses de chaque mois de `months`, à plat.

    Deux agrégats d'une ligne (revenus, dépenses) joints entre eux : un seul parcours de
    chaque table, borné par l'index (user_id, date).
    """
    incomes = (
        select(
            *(_income_sum(s, e).label(f"income_{i}") for i, (s, e) in enumerate(months))
        )
        .where(Income.user_id == user_id, Income.active.is_(True))
        .subquery()
    )
    expenses = (
        select(
            *(_expense_sum(s, e).label(f"expense_{i}") for i, (s, e) in enumerate(months))
        )
        .where(
            Expense.user_id == user_id,
            Expense.expense_date.between(
                min(s for s, _ in months), max(e for _, e in months)
            ),
        )
        .subquery()
    )
    columns = []
    for i in range(len(months)):
        columns += [incomes.c[f"income_{i}"], expenses.c[f"expense_{i}"]]
    return select(*columns).select_from(incomes).join(expenses, true())


def _contributions_sum(user_id: UUID, start: date, end: date) -> ColumnElement[Decimal]:
    """Sous-requête scalaire : versements sur les objectifs d'épargne pendant la période."""
    return (
        select(func.coalesce(func.sum(SavingsContribution.amount), Decimal("0")))
        .join(SavingsGoal)
        .where(
            SavingsGoal.user_id == user_id,
            SavingsContribution.created_at >= start,
            SavingsContribution.created_at < end + timedelta(days=1),
        )
        .scalar_subquery()
    )


async def contributions_total(
    db: AsyncSession, user_id: UUID, start: date, end: date
) -> Decimal:
    """Money already moved into savings goals during the period."""
    result = await db.execute(select(_contributions_sum(user_id, start, end)))
    return money(result.scalar_one())


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
    prev_savings: Decimal,
) -> tuple[
    list[WeeklyExpenseRead],
    list[float],
    Decimal | None,
    SavingsGoalSummary | None,
]:
    start, end = month_bounds(period)
    year, month = parse_period(period)
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
    year, month = parse_period(period)
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

    # Totaux mensuels par catégorie agrégés par la base (GROUP BY catégorie, mois) sur une
    # fenêtre bornée, au lieu de rapatrier chaque dépense de tout l'historique.
    window_start, _ = month_bounds(
        shift_period(period, -(settings.analytics_history_months - 1))
    )
    expense_year = extract("year", Expense.expense_date)
    expense_month = extract("month", Expense.expense_date)
    monthly_rows = await db.execute(
        select(
            Expense.category_id,
            expense_year,
            expense_month,
            func.sum(Expense.amount),
        )
        .where(
            Expense.user_id == user_id,
            Expense.expense_date.between(window_start, current_end),
        )
        .group_by(Expense.category_id, expense_year, expense_month)
    )
    monthly: dict[str, dict[tuple[int, int], float]] = defaultdict(dict)
    for category_id, y, m, total in monthly_rows.all():
        monthly[str(category_id)][(int(y), int(m))] = float(total)

    results = _engine.analyze_monthly(categories, monthly, year, month)

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


async def build_dashboard(
    user_id: UUID,
    period: str,
    db: AsyncSession,
    analytics: list[CategoryAnalyticsRead],
) -> DashboardRead:
    """Assemble le dashboard : totaux toujours calculés en direct, analytics fournis.

    Partagé par le chemin « calcul complet » et le chemin « cache », qui ne
    diffèrent que par l'origine de `analytics`.
    """
    start, end = month_bounds(period)
    prev_bounds = month_bounds(shift_period(period))

    # Mois courant, mois précédent et versements d'épargne : une seule requête
    totals = _period_totals_query(user_id, [(start, end), prev_bounds]).add_columns(
        _contributions_sum(user_id, start, end)
    )
    income_total, expense_total, prev_income, prev_expense, contributions = (
        await db.execute(totals)
    ).one()
    income_total = money(income_total)
    contributions = money(contributions)
    savings = income_total - expense_total
    savings_rate = (
        (savings / income_total).quantize(Decimal("0.00001"))
        if income_total
        else Decimal("0")
    )

    drifts = sorted(
        (x for x in analytics if x.profile.drift_score >= 0.5),
        key=lambda x: x.profile.drift_score,
        reverse=True,
    )

    weekly, sparkline, monthly_variation, savings_goal = (
        await _dashboard_extra(
            user_id, period, db, money(savings), money(prev_income) - prev_expense
        )
    )

    return DashboardRead(
        period=period,
        income=money(income_total),
        expenses=money(expense_total),
        savings=money(savings),
        remaining_balance=money(income_total - expense_total - contributions),
        contributions=money(contributions),
        savings_rate=savings_rate,
        categories_in_drift=len(drifts),
        potential_savings=money(
            sum((x.potential_saving for x in analytics), 0.0)
        ),
        top_drift_categories=drifts[:5],
        weekly=weekly,
        sparkline=sparkline,
        monthly_variation=monthly_variation,
        savings_goal=savings_goal,
    )


async def get_dashboard(
    user_id: UUID, period: str, db: AsyncSession
) -> DashboardRead:
    """Dashboard recalculé intégralement (sans passer par le cache)."""
    analytics = await compute_category_analytics(user_id, period, db)
    return await build_dashboard(user_id, period, db, analytics)


def _confidence_level(confidence: float) -> str:
    if confidence >= 0.75:
        return "HIGH"
    return "MEDIUM" if confidence >= 0.25 else "LOW"


def _trend_direction(trend: float) -> str:
    if trend > 0.05:
        return "INCREASING"
    return "DECREASING" if trend < -0.05 else "STABLE"


def _drift_signal(drift_score: float) -> str:
    if drift_score >= 0.8:
        return "STRONG_DRIFT"
    return "ATTENTION" if drift_score >= 0.5 else "NORMAL"


# Colonnes réécrites quand la ligne (user_id, category_id, period) existe déjà.
_ANALYTICS_UPDATE_COLUMNS = (
    "baseline",
    "trend",
    "volatility",
    "deviation",
    "frequency",
    "confidence",
    "trend_direction",
    "drift_signal",
    "current_amount",
    "estimated_saving",
    "profile_data",
)


async def refresh_analytics(
    user_id: UUID, period: str, db: AsyncSession
) -> dict:
    analytics = await compute_category_analytics(
        user_id, period, db
    )

    income, expense = await get_period_totals(user_id, period, db)
    savings = income - expense
    rate = (savings / income) if income else Decimal("0")

    # INSERT … ON CONFLICT DO UPDATE : une requête pour le snapshot et une pour toutes les
    # catégories, au lieu d'un SELECT puis INSERT/UPDATE par catégorie. Deux recalculs
    # simultanés du même mois ne lèvent plus d'IntegrityError : le second met à jour.
    await upsert(
        db,
        MonthlySnapshot,
        [
            {
                "id": uuid4(),
                "user_id": user_id,
                "period": period,
                "income": money(income),
                "expenses": money(expense),
                "savings": money(savings),
                "savings_rate": rate,
            }
        ],
        conflict_columns=("user_id", "period"),
        update_columns=("income", "expenses", "savings", "savings_rate"),
    )

    rows = []
    for a in analytics:
        p = a.profile
        rows.append({
            "id": uuid4(),
            "user_id": user_id,
            "category_id": a.category_id,
            "period": period,
            "baseline": money(a.baseline_amount),
            "trend": Decimal(str(p.trend)),
            "volatility": Decimal(str(p.volatility)),
            "deviation": Decimal(str(a.current_amount - a.expected_amount)),
            "frequency": 0,
            "confidence": _confidence_level(p.confidence),
            "trend_direction": _trend_direction(p.trend),
            "drift_signal": _drift_signal(p.drift_score),
            "current_amount": money(a.current_amount),
            "estimated_saving": money(a.potential_saving),
            "profile_data": _profile_to_dict(p)
            | {
                "essential": a.essential,
                "opportunity_score": a.opportunity_score,
            },
        })
    await upsert(
        db,
        CategoryAnalytics,
        rows,
        conflict_columns=("user_id", "category_id", "period"),
        update_columns=_ANALYTICS_UPDATE_COLUMNS,
    )

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
    income, expense = (
        await db.execute(_period_totals_query(user_id, [month_bounds(period)]))
    ).one()
    return money(income), expense


async def invalidate_snapshots(
    user_id: UUID, period: str, db: AsyncSession
) -> None:
    await db.execute(
        delete(CategoryAnalytics).where(
            CategoryAnalytics.user_id == user_id,
            CategoryAnalytics.period == period,
        )
    )
    # Les lignes de catégories sont supprimées (une catégorie sans dépense ne doit plus
    # apparaître) ; le snapshot du mois est toujours réécrit par l'upsert de refresh.
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


async def _load_cached_analytics(
    user_id: UUID, period: str, db: AsyncSession, *, allow_empty: bool = False
) -> list[CategoryAnalyticsRead] | None:
    """Lit les analytics en cache ; `None` si absent ou obsolète (à recalculer).

    Une ligne sans `profile_data` provient d'une ancienne version : le cache
    entier est alors jugé obsolète. `allow_empty` accepte un cache vide
    (utilisateur sans catégorie) comme valide.
    """
    # Catégories jointes (au lieu d'une 2e requête). populate_existing : l'upsert de
    # refresh_analytics passe par SQL, les objets déjà présents dans la session seraient
    # sinon renvoyés avec leurs anciennes valeurs.
    rows = (
        await db.execute(
            select(CategoryAnalytics, Category)
            .outerjoin(
                Category,
                and_(
                    Category.id == CategoryAnalytics.category_id,
                    Category.user_id == user_id,
                ),
            )
            .where(
                CategoryAnalytics.user_id == user_id,
                CategoryAnalytics.period == period,
            )
            .execution_options(populate_existing=True)
        )
    ).all()

    if (not rows and not allow_empty) or any(
        row.profile_data is None for row, _ in rows
    ):
        return None

    return [_snapshot_to_category_read(row, category) for row, category in rows]


async def _has_monthly_snapshot(
    user_id: UUID, period: str, db: AsyncSession
) -> bool:
    return (
        await db.execute(
            select(MonthlySnapshot.id).where(
                MonthlySnapshot.user_id == user_id,
                MonthlySnapshot.period == period,
            )
        )
    ).first() is not None


async def _cached_analytics_or_refresh(
    user_id: UUID, period: str, db: AsyncSession
) -> list[CategoryAnalyticsRead]:
    """Analytics du mois depuis le cache, recalculés une seule fois si absents ou obsolètes.

    Le snapshot du mois atteste que le calcul a eu lieu : un cache vide est alors valide
    (utilisateur sans dépense), ce qui évite de tout recalculer à chaque appel.
    """

    async def cached() -> list[CategoryAnalyticsRead] | None:
        if not await _has_monthly_snapshot(user_id, period, db):
            return None
        return await _load_cached_analytics(user_id, period, db, allow_empty=True)

    analytics = await cached()
    if analytics is None:
        await refresh_analytics(user_id, period, db)
        analytics = await cached()
    return analytics or []


async def get_category_analytics_snapshot(
    user_id: UUID, period: str, db: AsyncSession
) -> list[CategoryAnalyticsRead]:
    return await _cached_analytics_or_refresh(user_id, period, db)


async def get_dashboard_snapshot(
    user_id: UUID, period: str, db: AsyncSession
) -> DashboardRead:
    """Dashboard depuis le cache d'analytics, rafraîchi une fois si nécessaire."""
    analytics = await _cached_analytics_or_refresh(user_id, period, db)
    return await build_dashboard(user_id, period, db, analytics)
