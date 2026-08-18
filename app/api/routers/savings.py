from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import DbSession, UserDep
from app.models import SavingsGoal
from app.schemas.common import (
    SavingsGoalContribute,
    SavingsGoalContributeRead,
    SavingsGoalCreate,
    SavingsGoalRead,
)
from app.services import savings_service
from app.services.savings_service import BusinessRule, NotFound

router = APIRouter(
    prefix="/users/{user_id}/savings-goals",
    tags=["savings"],
)

_NOT_FOUND = {404: {"description": "Objectif introuvable"}}


@router.post(
    "",
    response_model=SavingsGoalRead,
    status_code=201,
)
async def create_goal(
    payload: SavingsGoalCreate,
    user: UserDep,
    db: DbSession,
):
    goal = SavingsGoal(
        user_id=user.id, **payload.model_dump()
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal


@router.get("", response_model=list[SavingsGoalRead])
async def list_goals(
    user: UserDep,
    db: DbSession,
):
    result = await db.execute(
        select(SavingsGoal)
        .where(
            SavingsGoal.user_id == user.id,
            SavingsGoal.active.is_(True),
        )
        .options(selectinload(SavingsGoal.contributions))
        .order_by(SavingsGoal.deadline)
    )
    return result.scalars().unique().all()


@router.post(
    "/{goal_id}/contribute",
    response_model=SavingsGoalContributeRead,
    responses=_NOT_FOUND,
)
async def contribute(
    goal_id: UUID,
    payload: SavingsGoalContribute,
    user: UserDep,
    db: DbSession,
):
    try:
        return await savings_service.contribute(
            user.id, goal_id, payload.amount, db
        )
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except BusinessRule as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
