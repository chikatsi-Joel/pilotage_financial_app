from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from app.api.deps import DbSession, UserDep
from app.schemas.common import (
    PaginatedResponse,
    SavingsGoalContribute,
    SavingsGoalContributeRead,
    SavingsGoalCreate,
    SavingsGoalRead,
)
from app.services import notification_service, savings_service

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
    return await savings_service.create_goal(
        user.id, payload, db
    )


@router.get("", response_model=PaginatedResponse[SavingsGoalRead])
async def list_goals(
    user: UserDep,
    db: DbSession,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    items, next_cursor, has_more = await savings_service.list_goals(
        user.id, db, cursor=cursor, limit=limit,
    )
    return PaginatedResponse(
        items=items, next_cursor=next_cursor, has_more=has_more,
    )


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
    result = await savings_service.contribute(
        user.id, goal_id, payload.amount, db
    )
    notification_service.schedule_savings_milestone(user.id, goal_id)
    return result
