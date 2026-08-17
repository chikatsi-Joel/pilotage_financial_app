from __future__ import annotations

from calendar import monthrange
from datetime import date
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_user
from app.db.session import get_db
from app.models import Budget, Expense, Income, Recommendation, RecommendationStatus, SavingsGoal, User
from app.schemas.common import BudgetDecision, BudgetRead, RecommendationRead
from app.services.budget import generate_budget
from app.api.routers.analytics import compute_category_analytics
from app.services.analytics import money

router = APIRouter(prefix="/users/{user_id}", tags=["budget"])


def month_bounds(period: str):
    try:
        first = date.fromisoformat(period + "-01")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="period must be YYYY-MM") from exc
    return first, date(first.year, first.month, monthrange(first.year, first.month)[1])


@router.post("/budget/recommendation", response_model=BudgetRead)
async def recommend_budget(period: str, user: User = Depends(get_user), db: AsyncSession = Depends(get_db)):
    start, end = month_bounds(period)
    analytics = await compute_category_analytics(user.id, period, db)
    incomes = await db.execute(select(Income.amount).where(Income.user_id == user.id, Income.income_date.between(start, end)))
    expenses = await db.execute(select(Expense.amount).where(Expense.user_id == user.id, Expense.expense_date.between(start, end)))
    projected_income = sum(incomes.scalars().all(), Decimal("0"))
    current_expenses = sum(expenses.scalars().all(), Decimal("0"))
    current_savings = projected_income - current_expenses

    goal_result = await db.execute(select(SavingsGoal).where(SavingsGoal.user_id == user.id, SavingsGoal.active.is_(True)).order_by(SavingsGoal.deadline))
    goal = goal_result.scalars().first()
    target_savings = None
    if goal:
        months_left = max(1, (goal.deadline.year - start.year) * 12 + goal.deadline.month - start.month + 1)
        target_savings = max(Decimal("0"), (goal.target_amount - goal.current_amount) / Decimal(months_left))

    inputs = [a.model_dump() | {"category_id": a.category_id} for a in analytics]
    budget = generate_budget(period, projected_income, current_expenses, current_savings, target_savings, inputs)

    existing = await db.execute(select(Budget).where(Budget.user_id == user.id, Budget.period == period))
    entity = existing.scalar_one_or_none()
    if entity is None:
        entity = Budget(
            user_id=user.id, period=period, recommended_total=budget.recommended_expenses,
            recommended_savings=budget.recommended_savings, rationale=budget.rationale,
        )
        db.add(entity)
    else:
        entity.recommended_total = budget.recommended_expenses
        entity.recommended_savings = budget.recommended_savings
        entity.rationale = budget.rationale
        # Accepted values remain untouched: recommendation refresh must not overwrite user decisions.

    # Rebuild only PROPOSED recommendations for this period; user decisions remain immutable.
    old_result = await db.execute(select(Recommendation).where(
        Recommendation.user_id == user.id,
        Recommendation.period == period,
        Recommendation.status == RecommendationStatus.PROPOSED,
    ))
    for old in old_result.scalars().all():
        await db.delete(old)
    for line in budget.categories:
        if line.reduction > 0:
            db.add(Recommendation(
                user_id=user.id, period=period, category_id=line.category_id,
                impact_estimated=line.reduction, justification=line.reason,
                status=RecommendationStatus.PROPOSED,
            ))
    await db.commit()
    return budget


@router.get("/budget/recommendations", response_model=list[RecommendationRead])
async def list_recommendations(period: str, user: User = Depends(get_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Recommendation).where(Recommendation.user_id == user.id, Recommendation.period == period).order_by(Recommendation.impact_estimated.desc()))
    recs = result.scalars().all()
    if not recs:
        return []
    from app.models import Category
    cat_ids = [r.category_id for r in recs]
    cats = await db.execute(select(Category).where(Category.id.in_(cat_ids)))
    names = {c.id: c.name for c in cats.scalars().all()}
    return [RecommendationRead(id=r.id, category_id=r.category_id, category_name=names.get(r.category_id, ""), period=r.period, impact_estimated=r.impact_estimated, justification=r.justification, status=r.status.value) for r in recs]


@router.post("/budget/recommendations/{recommendation_id}/status", response_model=RecommendationRead)
async def update_recommendation_status(recommendation_id, status: RecommendationStatus, user: User = Depends(get_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Recommendation).where(Recommendation.id == recommendation_id, Recommendation.user_id == user.id))
    rec = result.scalar_one_or_none()
    if not rec:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    if rec.status != RecommendationStatus.PROPOSED and status != rec.status:
        raise HTTPException(status_code=409, detail="A decided recommendation cannot be changed")
    rec.status = status
    await db.commit()
    await db.refresh(rec)
    from app.models import Category
    category = await db.get(Category, rec.category_id)
    return RecommendationRead(id=rec.id, category_id=rec.category_id, category_name=category.name if category else "", period=rec.period, impact_estimated=rec.impact_estimated, justification=rec.justification, status=rec.status.value)


@router.get("/budget", response_model=dict)
async def get_budget(period: str, user: User = Depends(get_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Budget).where(Budget.user_id == user.id, Budget.period == period))
    budget = result.scalar_one_or_none()
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    return {
        "period": budget.period,
        "recommended_total": budget.recommended_total,
        "recommended_savings": budget.recommended_savings,
        "accepted_total": budget.accepted_total,
        "accepted_savings": budget.accepted_savings,
        "rationale": budget.rationale,
    }


@router.put("/budget/decision", response_model=dict)
async def decide_budget(period: str, payload: BudgetDecision, user: User = Depends(get_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Budget).where(Budget.user_id == user.id, Budget.period == period))
    budget = result.scalar_one_or_none()
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    if payload.accepted_total + payload.accepted_savings > 0 and payload.accepted_total + payload.accepted_savings > Decimal("0"):
        # A budget is feasible only if expenses plus savings fit within the projected income.
        start, end = month_bounds(period)
        income_result = await db.execute(select(Income.amount).where(Income.user_id == user.id, Income.income_date.between(start, end)))
        income_total = sum(income_result.scalars().all(), Decimal("0"))
        if payload.accepted_total + payload.accepted_savings > income_total:
            raise HTTPException(status_code=422, detail="Accepted expenses plus savings exceed projected income")
    budget.accepted_total = money(payload.accepted_total)
    budget.accepted_savings = money(payload.accepted_savings)
    await db.commit()
    return {
        "period": budget.period,
        "recommended_total": budget.recommended_total,
        "recommended_savings": budget.recommended_savings,
        "accepted_total": budget.accepted_total,
        "accepted_savings": budget.accepted_savings,
        "rationale": budget.rationale,
    }
