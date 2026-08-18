from __future__ import annotations

from calendar import monthrange
from datetime import date
from decimal import Decimal
from uuid import UUID

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_user
from app.db.session import get_db
from app.models import Category, CategoryAnalytics, Expense, Income, MonthlySnapshot, User
from app.schemas.common import CategoryAnalyticsRead, DashboardRead
from app.services.analytics import FinancialAnalyticsEngine, money
from app.services.analytics.models import (
    Category as DomainCategory,
    CategoryType,
    Expense as DomainExpense,
    OptimizationPotential,
)

router = APIRouter(prefix="/users/{user_id}/analytics", tags=["analytics"])
_engine = FinancialAnalyticsEngine()


def month_bounds(period: str) -> tuple[date, date]:
    year, month = map(int, period.split("-"))
    first = date(year, month, 1)
    last = date(year, month, monthrange(year, month)[1])
    return first, last


def previous_periods(period: str, n: int) -> list[str]:
    d = date.fromisoformat(period + "-01")
    return [
        (d - relativedelta(months=i)).strftime("%Y-%m")
        for i in range(n, 0, -1)
    ]


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
            amount=e.amount, date=e.expense_date,
            category_id=str(e.category_id),
        )
        for e in expenses
    ]


def _profile_to_dict(profile) -> dict:
    return {
        "level": profile.level,
        "trend": profile.trend,
        "seasonality_strength": profile.seasonality_strength,
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


async def compute_category_analytics(
    user_id: UUID, period: str, db: AsyncSession
) -> list[CategoryAnalyticsRead]:
    year, month = map(int, period.split("-"))
    current_start, current_end = month_bounds(period)

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
    all_expenses = expense_result.scalars().all()
    domain_expenses = _to_domain_expenses(all_expenses)

    results = _engine.analyze(categories, domain_expenses, year, month)

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


@router.get(
    "categories", response_model=list[CategoryAnalyticsRead]
)
async def category_analytics(
    period: str,
    user: User = Depends(get_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        date.fromisoformat(period + "-01")
    except ValueError as exc:
        raise HTTPException(
            status_code=422, detail="period must be YYYY-MM"
        ) from exc
    return await compute_category_analytics(
        user.id, period, db
    )


@router.get("dashboard", response_model=DashboardRead)
async def dashboard(
    period: str,
    user: User = Depends(get_user),
    db: AsyncSession = Depends(get_db),
):
    start, end = month_bounds(period)
    incomes = await db.execute(
        select(Income.amount).where(
            Income.user_id == user.id,
            Income.income_date.between(start, end),
        )
    )
    expenses = await db.execute(
        select(Expense.amount).where(
            Expense.user_id == user.id,
            Expense.expense_date.between(start, end),
        )
    )
    income_total = sum(
        (x for x in incomes.scalars().all()), Decimal("0")
    )
    expense_total = sum(
        (x for x in expenses.scalars().all()), Decimal("0")
    )
    savings = income_total - expense_total
    savings_rate = (
        (savings / income_total).quantize(Decimal("0.00001"))
        if income_total
        else Decimal("0")
    )
    analytics = await compute_category_analytics(
        user.id, period, db
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
                (x.potential_saving for x in analytics), 0.0
            )
        ),
        top_drift_categories=drifts[:5],
    )


@router.post("refresh")
async def refresh_analytics(
    period: str,
    user: User = Depends(get_user),
    db: AsyncSession = Depends(get_db),
):
    start, end = month_bounds(period)
    analytics = await compute_category_analytics(
        user.id, period, db
    )
    income_result = await db.execute(
        select(Income.amount).where(
            Income.user_id == user.id,
            Income.income_date.between(start, end),
        )
    )
    expense_result = await db.execute(
        select(Expense.amount).where(
            Expense.user_id == user.id,
            Expense.expense_date.between(start, end),
        )
    )
    income = sum(
        income_result.scalars().all(), Decimal("0")
    )
    expense = sum(
        expense_result.scalars().all(), Decimal("0")
    )
    savings = income - expense
    rate = (savings / income) if income else Decimal("0")

    snapshot_result = await db.execute(
        select(MonthlySnapshot).where(
            MonthlySnapshot.user_id == user.id,
            MonthlySnapshot.period == period,
        )
    )
    snapshot = snapshot_result.scalar_one_or_none()
    if snapshot is None:
        snapshot = MonthlySnapshot(
            user_id=user.id, period=period,
            income=money(income), expenses=money(expense),
            savings=money(savings), savings_rate=rate,
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
                CategoryAnalytics.user_id == user.id,
                CategoryAnalytics.category_id == a.category_id,
                CategoryAnalytics.period == period,
            )
        )
        existing = existing_result.scalar_one_or_none()
        p = a.profile
        values = dict(
            user_id=user.id,
            category_id=a.category_id,
            period=period,
            baseline=money(a.baseline_amount),
            trend=Decimal(str(p.trend)),
            volatility=Decimal(str(p.volatility)),
            deviation=Decimal(
                str(a.current_amount - a.expected_amount)
            ),
            frequency=0,
            confidence="HIGH" if p.confidence >= 0.75 else (
                "MEDIUM" if p.confidence >= 0.25 else "LOW"
            ),
            trend_direction=(
                "INCREASING" if p.trend > 0.05
                else ("DECREASING" if p.trend < -0.05
                      else "STABLE")
            ),
            drift_signal=(
                "STRONG_DRIFT" if p.drift_score >= 0.8
                else ("ATTENTION" if p.drift_score >= 0.5
                      else "NORMAL")
            ),
            current_amount=money(a.current_amount),
            estimated_saving=money(a.potential_saving),
        )
        if existing is None:
            db.add(CategoryAnalytics(**values))
        else:
            for key, value in values.items():
                if key not in {"user_id", "category_id", "period"}:
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
