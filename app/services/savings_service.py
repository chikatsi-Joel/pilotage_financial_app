from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SavingsContribution, SavingsGoal
from app.schemas.common import (
    SavingsGoalContributeRead,
    SavingsGoalCreate,
)
from app.services.analytics import money
from app.services.analytics_service import (
    get_period_totals,
    month_bounds,
)


class NotFound(Exception):
    pass


class BusinessRule(Exception):
    pass


async def create_goal(
    user_id: UUID,
    payload: SavingsGoalCreate,
    db: AsyncSession,
) -> SavingsGoal:
    goal = SavingsGoal(
        user_id=user_id, **payload.model_dump()
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal


async def list_goals(
    user_id: UUID, db: AsyncSession
) -> list[SavingsGoal]:
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(SavingsGoal)
        .where(
            SavingsGoal.user_id == user_id,
            SavingsGoal.active.is_(True),
        )
        .options(selectinload(SavingsGoal.contributions))
        .order_by(SavingsGoal.deadline)
    )
    return list(result.scalars().unique().all())


async def _available_for_user(
    user_id: UUID, d: date, db: AsyncSession
) -> Decimal:
    period = d.strftime("%Y-%m")
    start, end = month_bounds(period)

    income, expenses = await get_period_totals(
        user_id, period, db
    )

    contrib_result = await db.execute(
        select(SavingsContribution.amount)
        .join(SavingsGoal)
        .where(
            SavingsGoal.user_id == user_id,
            SavingsContribution.created_at >= start,
            SavingsContribution.created_at < end,
        )
    )
    prior_contributions = sum(
        contrib_result.scalars().all(), Decimal("0")
    )

    return money(income - expenses - prior_contributions)


async def contribute(
    user_id: UUID,
    goal_id: UUID,
    amount: Decimal,
    db: AsyncSession,
) -> SavingsGoalContributeRead:
    if amount <= 0:
        raise BusinessRule("Contribution amount must be positive")

    result = await db.execute(
        select(SavingsGoal).where(
            SavingsGoal.id == goal_id,
            SavingsGoal.user_id == user_id,
        )
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise NotFound("Savings goal not found")
    if not goal.active:
        raise BusinessRule("Cannot contribute to an inactive goal")

    available = await _available_for_user(user_id, date.today(), db)
    if available < amount:
        raise BusinessRule(f"Insufficient available funds "
            f"(available: {available}, requested: {amount})")

    contribution = SavingsContribution(
        savings_goal_id=goal.id,
        amount=money(amount),
    )
    db.add(contribution)
    await db.commit()

    total_result = await db.execute(
        select(SavingsContribution.amount).where(
            SavingsContribution.savings_goal_id == goal.id,
        )
    )
    new_total = money(sum(total_result.scalars().all(), Decimal("0")))

    return SavingsGoalContributeRead(
        goal_id=goal.id,
        goal_name=goal.name,
        amount=money(amount),
        new_total=new_total,
        target_amount=goal.target_amount,
        completed=new_total >= goal.target_amount,
    )
