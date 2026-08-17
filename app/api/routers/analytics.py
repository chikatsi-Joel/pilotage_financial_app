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
from app.core.config import settings
from app.db.session import get_db
from app.models import Category, CategoryAnalytics, Expense, Income, MonthlySnapshot, SavingsGoal, User
from app.schemas.common import CategoryAnalyticsRead, DashboardRead
from app.services.analytics import analyze_category, money

router = APIRouter(prefix="/users/{user_id}/analytics", tags=["analytics"])


def month_bounds(period: str) -> tuple[date, date]:
    year, month = map(int, period.split("-"))
    first = date(year, month, 1)
    last = date(year, month, monthrange(year, month)[1])
    return first, last


def previous_periods(period: str, n: int) -> list[str]:
    d = date.fromisoformat(period + "-01")
    return [(d - relativedelta(months=i)).strftime("%Y-%m") for i in range(n, 0, -1)]


async def compute_category_analytics(user_id: UUID, period: str, db: AsyncSession) -> list[CategoryAnalyticsRead]:
    current_start, current_end = month_bounds(period)
    category_result = await db.execute(select(Category).where(Category.user_id == user_id, Category.active.is_(True)).order_by(Category.name))
    categories = category_result.scalars().all()
    history_periods = previous_periods(period, settings.analytics_lookback_months)
    hist_bounds = [month_bounds(p) for p in history_periods]

    expense_result = await db.execute(select(Expense).where(Expense.user_id == user_id, Expense.expense_date <= current_end))
    expenses = expense_result.scalars().all()
    by_cat_month: dict[tuple[UUID, str], Decimal] = {}
    freq_current: dict[UUID, int] = {}
    for e in expenses:
        p = e.expense_date.strftime("%Y-%m")
        by_cat_month[(e.category_id, p)] = by_cat_month.get((e.category_id, p), Decimal("0")) + e.amount
        if current_start <= e.expense_date <= current_end:
            freq_current[e.category_id] = freq_current.get(e.category_id, 0) + 1

    results: list[CategoryAnalyticsRead] = []
    for c in categories:
        history_values = [by_cat_month[(c.id, p)] for p in history_periods if (c.id, p) in by_cat_month]
        current = by_cat_month.get((c.id, period), Decimal("0"))
        a = analyze_category(history_values, current, c.essentiality.value == "ESSENTIAL", c.optimization_potential.value)
        results.append(CategoryAnalyticsRead(
            category_id=c.id, category_name=c.name, period=period, current=money(current), baseline=a.baseline,
            trend=a.trend, trend_direction=a.trend_direction.value, volatility=a.volatility,
            frequency=freq_current.get(c.id, 0), deviation=a.deviation, drift_signal=a.drift_signal.value,
            confidence=a.confidence.value, essential=c.essentiality.value == "ESSENTIAL",
            optimization_potential=c.optimization_potential.value, estimated_saving=a.estimated_saving,
        ))
    return results


@router.get("categories", response_model=list[CategoryAnalyticsRead])
async def category_analytics(period: str, user: User = Depends(get_user), db: AsyncSession = Depends(get_db)):
    try:
        date.fromisoformat(period + "-01")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="period must be YYYY-MM") from exc
    return await compute_category_analytics(user.id, period, db)


@router.get("dashboard", response_model=DashboardRead)
async def dashboard(period: str, user: User = Depends(get_user), db: AsyncSession = Depends(get_db)):
    start, end = month_bounds(period)
    incomes = await db.execute(select(Income.amount).where(Income.user_id == user.id, Income.income_date.between(start, end)))
    expenses = await db.execute(select(Expense.amount).where(Expense.user_id == user.id, Expense.expense_date.between(start, end)))
    income_total = sum((x for x in incomes.scalars().all()), Decimal("0"))
    expense_total = sum((x for x in expenses.scalars().all()), Decimal("0"))
    savings = income_total - expense_total
    savings_rate = (savings / income_total).quantize(Decimal("0.00001")) if income_total else Decimal("0")
    analytics = await compute_category_analytics(user.id, period, db)
    drifts = [x for x in analytics if x.drift_signal != "NORMAL"]
    drifts.sort(key=lambda x: abs(x.deviation), reverse=True)
    return DashboardRead(
        period=period, income=money(income_total), expenses=money(expense_total), savings=money(savings),
        savings_rate=savings_rate, categories_in_drift=len(drifts),
        potential_savings=money(sum((x.estimated_saving for x in analytics), Decimal("0"))),
        top_drift_categories=drifts[:5],
    )


@router.post("refresh")
async def refresh_analytics(period: str, user: User = Depends(get_user), db: AsyncSession = Depends(get_db)):
    start, end = month_bounds(period)
    analytics = await compute_category_analytics(user.id, period, db)
    income_result = await db.execute(select(Income.amount).where(Income.user_id == user.id, Income.income_date.between(start, end)))
    expense_result = await db.execute(select(Expense.amount).where(Expense.user_id == user.id, Expense.expense_date.between(start, end)))
    income = sum(income_result.scalars().all(), Decimal("0"))
    expense = sum(expense_result.scalars().all(), Decimal("0"))
    savings = income - expense
    rate = (savings / income) if income else Decimal("0")
    snapshot_result = await db.execute(select(MonthlySnapshot).where(MonthlySnapshot.user_id == user.id, MonthlySnapshot.period == period))
    snapshot = snapshot_result.scalar_one_or_none()
    if snapshot is None:
        snapshot = MonthlySnapshot(user_id=user.id, period=period, income=money(income), expenses=money(expense), savings=money(savings), savings_rate=rate)
        db.add(snapshot)
    else:
        snapshot.income = money(income); snapshot.expenses = money(expense); snapshot.savings = money(savings); snapshot.savings_rate = rate
    for a in analytics:
        existing_result = await db.execute(select(CategoryAnalytics).where(
            CategoryAnalytics.user_id == user.id, CategoryAnalytics.category_id == a.category_id, CategoryAnalytics.period == period
        ))
        existing = existing_result.scalar_one_or_none()
        values = dict(
            user_id=user.id, category_id=a.category_id, period=period, baseline=a.baseline, trend=a.trend,
            volatility=a.volatility, deviation=a.deviation, frequency=a.frequency, confidence=a.confidence,
            trend_direction=a.trend_direction, drift_signal=a.drift_signal, current_amount=a.current,
            estimated_saving=a.estimated_saving,
        )
        if existing is None:
            db.add(CategoryAnalytics(**values))
        else:
            for key, value in values.items():
                if key not in {"user_id", "category_id", "period"}:
                    setattr(existing, key, value)
    await db.commit()
    return {"period": period, "snapshot": {"income": money(income), "expenses": money(expense), "savings": money(savings), "savings_rate": rate}, "categories": len(analytics)}
