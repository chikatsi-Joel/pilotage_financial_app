from fastapi import APIRouter, Query, status

from app.api.deps import DbSession, UserDep
from app.models import RecommendationStatus
from app.schemas.common import (
    BudgetDecision,
    BudgetRead,
    PaginatedResponse,
    RecommendationRead,
)
from app.services import budget_service

router = APIRouter(prefix="/users/{user_id}", tags=["budget"])

_NOT_FOUND = {404: {"description": "Ressource introuvable"}}


@router.post(
    "/budget/recommendation",
    response_model=BudgetRead,
)
async def recommend_budget(
    period: str,
    user: UserDep,
    db: DbSession,
):
    return await budget_service.recommend_budget(
        user.id, period, db
    )
@router.get(
    "/budget/recommendations",
    response_model=PaginatedResponse[RecommendationRead],
)
async def list_recommendations(
    period: str,
    user: UserDep,
    db: DbSession,
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
):
    items, next_cursor, has_more = await budget_service.list_recommendations(
        user.id, period, db, cursor=cursor, limit=limit,
    )
    return PaginatedResponse(
        items=items, next_cursor=next_cursor, has_more=has_more,
    )


@router.post(
    "/budget/recommendations/{recommendation_id}/status",
    response_model=RecommendationRead,
    responses=_NOT_FOUND,
    status_code=status.HTTP_200_OK,
)
async def update_recommendation_status(
    recommendation_id,
    status: RecommendationStatus,
    user: UserDep,
    db: DbSession,
):
    return await budget_service.update_recommendation_status(
        user.id, recommendation_id, status, db
    )
@router.get(
    "/budget",
    response_model=dict,
    responses=_NOT_FOUND,
)
async def get_budget(
    period: str,
    user: UserDep,
    db: DbSession,
):
    return await budget_service.get_budget(
        user.id, period, db
    )
@router.put(
    "/budget/decision",
    response_model=dict,
    responses=_NOT_FOUND,
)
async def decide_budget(
    period: str,
    payload: BudgetDecision,
    user: UserDep,
    db: DbSession,
):
    return await budget_service.decide_budget(
        user.id,
        period,
        payload.accepted_total,
        payload.accepted_savings,
        db,
    )