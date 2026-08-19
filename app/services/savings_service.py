from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import SavingsContribution, SavingsGoal
from app.schemas.common import (
    SavingsGoalAnalysis,
    SavingsGoalContributeRead,
    SavingsGoalCreate,
)
from app.services.analytics import money
from app.services.analytics_service import (
    get_period_totals,
    month_bounds,
)
from app.utils.savings_goal import get_contribution_trend


class NotFound(Exception):
    pass


class BusinessRule(Exception):
    pass


async def create_goal( user_id: UUID, payload: SavingsGoalCreate, db: AsyncSession, ) -> SavingsGoal:

    goal = SavingsGoal( user_id=user_id, **payload.model_dump() )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)

    return goal


async def list_goals( user_id: UUID, db: AsyncSession ) -> list[SavingsGoal]:
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


def _previous_month(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def _monthly_periods(period: str, count: int = 6) -> list[str]:
    year, month = map(int, period.split("-"))
    periods: list[str] = []
    for _ in range(count):
        periods.append(f"{year:04d}-{month:02d}")
        year, month = _previous_month(year, month)
    return list(reversed(periods))


def _contribution_regularity(values: list[Decimal]) -> float | None:
    """Return 1 for perfectly regular amounts and 0 for very irregular ones."""
    if not any(values):
        return None
    mean = sum(values, Decimal("0")) / len(values)
    if not mean:
        return None
    variance = sum((value - mean) ** 2 for value in values) / len(values)
    coefficient_of_variation = variance.sqrt() / mean
    return round(float(max(Decimal("0"), Decimal("1") - coefficient_of_variation)), 2)


def _months_until(deadline: date, period: str) -> int:
    year, month = map(int, period.split("-"))
    return (deadline.year - year) * 12 + deadline.month - month


async def build_goal_analyses( user_id: UUID, period: str, db: AsyncSession, ) -> list[SavingsGoalAnalysis]:
    """Create compact, derived savings-goal data safe to send to the LLM."""
    _, period_end = month_bounds(period)
    periods = _monthly_periods(period)

    result = await db.execute(
        select(SavingsGoal)
        .where(
            SavingsGoal.user_id == user_id,
            SavingsGoal.active.is_(True),
        )
        .options(
            selectinload(
                SavingsGoal.contributions.and_(
                    SavingsContribution.created_at <= period_end
                )
            )
        )
        .order_by(SavingsGoal.deadline)
    )
    goals = result.scalars().all()

    analyses: list[SavingsGoalAnalysis] = []

    for goal in goals:
        totals_by_period = {p: Decimal("0") for p in periods}
        current_amount = Decimal("0")
        contribution_count = 0

        for contribution in goal.contributions:
            current_amount += contribution.amount
            contribution_count += 1
            contribution_period = contribution.created_at.strftime("%Y-%m")
            bucket = totals_by_period.get(contribution_period)
            if bucket is not None:
                totals_by_period[contribution_period] = bucket + contribution.amount

        current_amount = money(current_amount)
        remaining_amount = money(max(Decimal("0"), goal.target_amount - current_amount))

        monthly_values = list(totals_by_period.values())
        active_months = [v for v in monthly_values if v > 0]

        average = (
            money(sum(monthly_values, Decimal("0")) / len(monthly_values))
            if active_months
            else None
        )
        recent = money(monthly_values[-1]) if active_months else None

        months_until = _months_until(goal.deadline, period)
        required = (
            money(remaining_amount / months_until)
            if remaining_amount > 0 and months_until > 0
            else None
        )

        analyses.append(
            SavingsGoalAnalysis(
                goal_id=goal.id,
                name=goal.name,
                description=goal.description,
                target_amount=goal.target_amount,
                target_date=goal.deadline,
                current_amount=current_amount,
                remaining_amount=remaining_amount,
                progress_percentage=(
                    round(float(current_amount / goal.target_amount * 100), 2)
                    if goal.target_amount
                    else 0.0
                ),
                contribution_count=contribution_count,
                average_monthly_contribution=average,
                recent_monthly_contribution=recent,
                contribution_trend=get_contribution_trend(monthly_values),
                contribution_regularity=_contribution_regularity(monthly_values),
                required_monthly_contribution=required,
            )
        )

    return analyses


async def get_total_contributions_for_period(
    user_id: UUID, period: str, db: AsyncSession, ) -> Decimal:

    start, end = month_bounds(period)

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


async def _available_for_user(user_id: UUID, d: date, db: AsyncSession) -> Decimal:
    period = d.strftime("%Y-%m")
    start, end = month_bounds(period)

    income, expenses = await get_period_totals(user_id, period, db)

    contrib_result = await db.execute(
        select(func.coalesce(func.sum(SavingsContribution.amount), Decimal("0")))
        .join(SavingsGoal)
        .where(
            SavingsGoal.user_id == user_id,
            SavingsContribution.created_at >= start,
            SavingsContribution.created_at < end,
        )
    )
    prior_contributions = contrib_result.scalar_one()

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
        select(SavingsGoal)
        .where(SavingsGoal.id == goal_id, SavingsGoal.user_id == user_id)
        .with_for_update()
    )

    goal = result.scalar_one_or_none()
    if not goal:
        raise NotFound("Savings goal not found")
    if not goal.active:
        raise BusinessRule("Cannot contribute to an inactive goal")

    available = await _available_for_user(user_id, date.today(), db)
    if available < amount:
        raise BusinessRule(
            f"Insufficient available funds "
            f"(available: {available}, requested: {amount})"
        )

    current_total_result = await db.execute(
        select(func.coalesce(func.sum(SavingsContribution.amount), Decimal("0")))
        .where(SavingsContribution.savings_goal_id == goal.id)
    )
    current_total = current_total_result.scalar_one()

    contribution = SavingsContribution(savings_goal_id=goal.id, amount=money(amount))
    db.add(contribution)
    await db.commit()

    new_total = money(current_total + money(amount))

    return SavingsGoalContributeRead(
        goal_id=goal.id,
        goal_name=goal.name,
        amount=money(amount),
        new_total=new_total,
        target_amount=goal.target_amount,
        completed=new_total >= goal.target_amount,
    )

