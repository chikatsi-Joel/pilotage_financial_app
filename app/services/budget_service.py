from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Budget, Category, Recommendation,
    RecommendationStatus, SavingsGoal,
)
from app.schemas.common import (
    BudgetRead, RecommendationRead,
)
from app.services.analytics import money
from app.services.analytics_service import (
    compute_category_analytics,
    get_period_totals, month_bounds,
)
from app.services.budget import generate_budget


class NotFound(Exception):
    pass


class Conflict(Exception):
    pass


class BusinessRule(Exception):
    pass


async def recommend_budget(user_id: UUID, period: str, db: AsyncSession) -> BudgetRead:
    start, _ = month_bounds(period)

    analytics = await compute_category_analytics(
        user_id, period, db
    )
    projected_income, current_expenses = (
        await get_period_totals(user_id, period, db)
    )
    current_savings = projected_income - current_expenses

    goal_result = await db.execute(
        select(SavingsGoal)
        .where(
            SavingsGoal.user_id == user_id,
            SavingsGoal.active.is_(True),
        )
        .options(selectinload(SavingsGoal.contributions))
        .order_by(SavingsGoal.deadline)
    )
    goal = goal_result.scalars().first()
    target_savings = None
    if goal:
        current = sum(
            (c.amount for c in goal.contributions),
            Decimal("0"),
        )
        months_left = max(
            1,
            (goal.deadline.year - start.year) * 12
            + goal.deadline.month
            - start.month
            + 1,
        )
        target_savings = max(
            Decimal("0"),
            (goal.target_amount - current)
            / Decimal(months_left),
        )

    inputs = [
        a.model_dump() | {"category_id": a.category_id}
        for a in analytics
    ]
    budget = generate_budget(
        period, projected_income, current_expenses,
        current_savings, target_savings, inputs,
    )

    existing = await db.execute(
        select(Budget).where(
            Budget.user_id == user_id,
            Budget.period == period,
        )
    )
    entity = existing.scalar_one_or_none()
    if entity is None:
        entity = Budget(
            user_id=user_id,
            period=period,
            recommended_total=budget.recommended_expenses,
            recommended_savings=budget.recommended_savings,
            rationale=budget.rationale,
        )
        db.add(entity)
    else:
        entity.recommended_total = budget.recommended_expenses
        entity.recommended_savings = budget.recommended_savings
        entity.rationale = budget.rationale

    old_result = await db.execute(
        select(Recommendation).where(
            Recommendation.user_id == user_id,
            Recommendation.period == period,
            Recommendation.status
            == RecommendationStatus.PROPOSED,
        )
    )
    for old in old_result.scalars().all():
        await db.delete(old)
    for line in budget.categories:
        if line.reduction > 0:
            db.add(Recommendation(
                user_id=user_id,
                period=period,
                category_id=line.category_id,
                impact_estimated=line.reduction,
                justification=line.reason,
                status=RecommendationStatus.PROPOSED,
            ))
    await db.commit()
    return budget


async def list_recommendations(
    user_id: UUID, period: str, db: AsyncSession
) -> list[RecommendationRead]:
    result = await db.execute(
        select(Recommendation)
        .where(
            Recommendation.user_id == user_id,
            Recommendation.period == period,
        )
        .order_by(Recommendation.impact_estimated.desc())
    )
    recs = result.scalars().all()
    if not recs:
        return []

    cat_ids = [r.category_id for r in recs]
    cats = await db.execute(
        select(Category).where(Category.id.in_(cat_ids))
    )
    names = {c.id: c.name for c in cats.scalars().all()}

    return [
        RecommendationRead(
            id=r.id,
            category_id=r.category_id,
            category_name=names.get(r.category_id, ""),
            period=r.period,
            impact_estimated=r.impact_estimated,
            justification=r.justification,
            status=r.status.value,
        )
        for r in recs
    ]


async def update_recommendation_status(
    user_id: UUID,
    recommendation_id: UUID,
    new_status: RecommendationStatus,
    db: AsyncSession,
) -> RecommendationRead:
    result = await db.execute(
        select(Recommendation).where(
            Recommendation.id == recommendation_id,
            Recommendation.user_id == user_id,
        )
    )
    rec = result.scalar_one_or_none()
    if not rec:
        raise NotFound("Recommendation not found")
    if (
        rec.status != RecommendationStatus.PROPOSED
        and new_status != rec.status
    ):
        raise Conflict(
            "A decided recommendation cannot be changed"
        )

    rec.status = new_status
    await db.commit()
    await db.refresh(rec)

    category = await db.get(Category, rec.category_id)
    return RecommendationRead(
        id=rec.id,
        category_id=rec.category_id,
        category_name=category.name if category else "",
        period=rec.period,
        impact_estimated=rec.impact_estimated,
        justification=rec.justification,
        status=rec.status.value,
    )


async def get_budget(
    user_id: UUID, period: str, db: AsyncSession
) -> dict:
    result = await db.execute(
        select(Budget).where(
            Budget.user_id == user_id,
            Budget.period == period,
        )
    )
    budget = result.scalar_one_or_none()
    if not budget:
        raise NotFound("Budget not found")
    return {
        "period": budget.period,
        "recommended_total": budget.recommended_total,
        "recommended_savings": budget.recommended_savings,
        "accepted_total": budget.accepted_total,
        "accepted_savings": budget.accepted_savings,
        "rationale": budget.rationale,
    }


async def decide_budget(
    user_id: UUID,
    period: str,
    accepted_total: Decimal,
    accepted_savings: Decimal,
    db: AsyncSession,
) -> dict:
    result = await db.execute(
        select(Budget).where(
            Budget.user_id == user_id,
            Budget.period == period,
        )
    )
    budget = result.scalar_one_or_none()
    if not budget:
        raise NotFound("Budget not found")

    if (
        accepted_total + accepted_savings > 0
        and accepted_total + accepted_savings
        > Decimal("0")
    ):
        income, _ = await get_period_totals(
            user_id, period, db
        )
        if (
            accepted_total + accepted_savings > income
        ):
            raise BusinessRule(
                "Accepted expenses plus savings "
                "exceed projected income"
            )

    budget.accepted_total = money(accepted_total)
    budget.accepted_savings = money(accepted_savings)
    await db.commit()
    return {
        "period": budget.period,
        "recommended_total": budget.recommended_total,
        "recommended_savings": budget.recommended_savings,
        "accepted_total": budget.accepted_total,
        "accepted_savings": budget.accepted_savings,
        "rationale": budget.rationale,
    }
