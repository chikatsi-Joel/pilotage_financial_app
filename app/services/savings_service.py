from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import SavingsContribution, SavingsGoal, User
from app.schemas.common import (
    SavingsGoalAnalysis,
    SavingsGoalContributeRead,
    SavingsGoalCreate,
    SavingsGoalUpdate,
)
from app.services.analytics import money
from app.services.analytics_service import (
    contributions_total,
    get_period_totals,
)
from app.services.errors import BusinessRule, NotFound
from app.services.periods import month_bounds, period_of, recent_periods
from app.utils.savings_goal import get_contribution_trend


async def create_goal(
    user_id: UUID, payload: SavingsGoalCreate, db: AsyncSession
) -> SavingsGoal:

    goal = SavingsGoal( user_id=user_id, **payload.model_dump() )
    db.add(goal)
    await db.commit()

    result = await db.execute(
        select(SavingsGoal)
        .where(SavingsGoal.id == goal.id)
        .options(selectinload(SavingsGoal.contributions))
    )
    return result.scalar_one()


async def update_goal(
    user_id: UUID, goal_id: UUID, payload: SavingsGoalUpdate, db: AsyncSession
) -> SavingsGoal:
    """Modifie le nom, le libellé, la cible ou l'échéance d'un objectif de l'utilisateur."""
    goal = (
        await db.execute(
            select(SavingsGoal)
            .where(SavingsGoal.id == goal_id, SavingsGoal.user_id == user_id)
            .options(selectinload(SavingsGoal.contributions))
        )
    ).scalar_one_or_none()
    if goal is None:
        raise NotFound("Savings goal not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is None and field != "description":
            continue  # null sur un champ obligatoire : ignoré plutôt qu'une erreur SQL
        setattr(goal, field, value)
    # Pas de refresh : les contributions sont déjà chargées (selectinload) et la session ne
    # les expire pas au commit (expire_on_commit=False).
    await db.commit()
    return goal


async def list_goals(
    user_id: UUID,
    db: AsyncSession,
    *,
    cursor: str | None = None,
    limit: int = 20,
) -> tuple[list[SavingsGoal], str | None, bool]:
    from app.services.pagination import paginate

    query = (
        select(SavingsGoal)
        .where(
            SavingsGoal.user_id == user_id,
            SavingsGoal.active.is_(True),
        )
        .options(selectinload(SavingsGoal.contributions))
    )

    return await paginate(
        db, query, limit, cursor,
        id_col=SavingsGoal.id, sort_col=SavingsGoal.deadline, sort_desc=False,
    )


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


async def build_goal_analyses(user_id: UUID, period: str, db: AsyncSession) -> list[SavingsGoalAnalysis]:
    """Create compact, derived savings-goal data safe to send to the LLM."""
    _, period_end = month_bounds(period)
    periods = recent_periods(period)

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
            contribution_period = period_of(contribution.created_at)
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


async def get_total_contributions_for_period(user_id: UUID, period: str, db: AsyncSession) -> Decimal:
    start, end = month_bounds(period)
    return await contributions_total(db, user_id, start, end)


async def _available_for_user(user_id: UUID, d: date, db: AsyncSession) -> Decimal:
    """Solde libre du mois de `d` : revenus - dépenses - contributions déjà versées."""
    period = period_of(d)
    income, expenses = await get_period_totals(user_id, period, db)
    contributions = await get_total_contributions_for_period(user_id, period, db)
    return money(income - expenses - contributions)


async def contribute(user_id: UUID, goal_id: UUID, amount: Decimal, db: AsyncSession,) -> SavingsGoalContributeRead:
    if amount <= 0:
        raise BusinessRule("Contribution amount must be positive")

    # Verrou au niveau utilisateur : le solde disponible est partagé entre tous
    # les objectifs, verrouiller un seul objectif ne protège pas contre deux
    # contributions simultanées sur des objectifs différents.
    await db.execute(select(User.id).where(User.id == user_id).with_for_update())

    result = await db.execute(
        select(SavingsGoal)
        .where(SavingsGoal.id == goal_id, SavingsGoal.user_id == user_id)
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

