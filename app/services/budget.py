from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Budget,
    Category,
    Recommendation,
    RecommendationStatus,
    SavingsGoal,
)
from app.schemas.common import (
    BudgetCategoryLine,
    BudgetRead,
    RecommendationRead,
)
from app.services.analytics import money
from app.services.analytics_service import (
    compute_category_analytics,
    get_period_totals,
    month_bounds,
)


class NotFound(Exception):
    pass


class Conflict(Exception):
    pass


class BusinessRule(Exception):
    pass


def generate_budget(
    period: str,
    projected_income: Decimal,
    current_expenses: Decimal,
    current_savings: Decimal,
    target_savings: Decimal | None,
    category_inputs: list[dict],
) -> BudgetRead:
    lines: list[BudgetCategoryLine] = []
    potential = Decimal("0")

    for item in category_inputs:
        current = money(item["current_amount"])
        baseline = item["baseline_amount"]
        essential = bool(item["essential"])
        variation = item["variation_percentage"]

        if essential:
            proposed = max(current, Decimal(str(baseline)))
            reason = "Dépense essentielle : aucune réduction automatique."
        else:
            if variation > 20:
                factor = Decimal("0.20")
            elif variation > 10:
                factor = Decimal("0.10")
            else:
                factor = Decimal("0.05")
            basis = Decimal(str(baseline))
            proposed = money(basis * (Decimal("1") - factor))
            proposed = min(proposed, current) if current > 0 else proposed
            reason = (
                f"Réduction de {factor * 100:.0f}% fondée sur la variation de {variation:.1f}%."
            )

        reduction = max(Decimal("0"), current - proposed)
        lines.append(
            BudgetCategoryLine(
                category_id=item["category_id"],
                category_name=item["name"],
                current=current,
                baseline=float(baseline),
                recommended=proposed,
                essential=essential,
                reduction=money(reduction),
                reason=reason,
            )
        )
        potential += reduction

    recommended_expenses = money(sum((x.recommended for x in lines), Decimal("0")))
    available_after_expenses = max(
        Decimal("0"),
        money(projected_income - recommended_expenses),
    )
    recommended_savings = available_after_expenses
    target_gap = money(
        max(
            Decimal("0"),
            (target_savings or Decimal("0")) - recommended_savings,
        )
    )

    rationale = (
        "Budget calculé à partir du revenu prévu, "
        "des baselines disponibles, de l'essentialité, "
        "du potentiel d'optimisation et des dérives "
        "détectées. Les catégories essentielles ne sont "
        "pas réduites automatiquement."
    )
    return BudgetRead(
        period=period,
        projected_income=money(projected_income),
        current_expenses=money(current_expenses),
        recommended_expenses=recommended_expenses,
        current_savings=money(current_savings),
        recommended_savings=recommended_savings,
        target_savings=(money(target_savings) if target_savings is not None else None),
        potential_savings=money(potential),
        target_gap=target_gap,
        categories=lines,
        rationale=rationale,
    )


async def recommend_budget(user_id: UUID, period: str, db: AsyncSession) -> BudgetRead:
    start, _ = month_bounds(period)

    analytics = await compute_category_analytics(user_id, period, db)
    projected_income, current_expenses = await get_period_totals(user_id, period, db)
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
            (goal.deadline.year - start.year) * 12 + goal.deadline.month - start.month + 1,
        )
        target_savings = max(
            Decimal("0"),
            (goal.target_amount - current) / Decimal(months_left),
        )

    inputs = [a.model_dump() | {"category_id": a.category_id} for a in analytics]
    budget = generate_budget(
        period,
        projected_income,
        current_expenses,
        current_savings,
        target_savings,
        inputs,
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
            Recommendation.status == RecommendationStatus.PROPOSED,
        )
    )
    for old in old_result.scalars().all():
        await db.delete(old)
    for line in budget.categories:
        if line.reduction > 0:
            db.add(
                Recommendation(
                    user_id=user_id,
                    period=period,
                    category_id=line.category_id,
                    impact_estimated=line.reduction,
                    justification=line.reason,
                    status=RecommendationStatus.PROPOSED,
                )
            )
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
    cats = await db.execute(select(Category).where(Category.id.in_(cat_ids)))
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
    if rec.status != RecommendationStatus.PROPOSED and new_status != rec.status:
        raise Conflict("A decided recommendation cannot be changed")

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


async def get_budget(user_id: UUID, period: str, db: AsyncSession) -> dict:
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

    if accepted_total + accepted_savings > 0 and accepted_total + accepted_savings > Decimal("0"):
        income, _ = await get_period_totals(user_id, period, db)
        if accepted_total + accepted_savings > income:
            raise BusinessRule("Accepted expenses plus savings exceed projected income")

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
