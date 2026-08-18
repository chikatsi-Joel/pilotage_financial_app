from fastapi import APIRouter, HTTPException, status

from app.api.deps import DbSession, UserDep
from app.models import RecommendationStatus
from app.schemas.common import (
    BudgetDecision, BudgetRead, RecommendationRead,
)
from app.services import budget_service
from app.services.analytics_service import InvalidPeriod
from app.services.budget_service import (
    BusinessRule, Conflict, NotFound,
)

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
    try:
        return await budget_service.recommend_budget(
            user.id, period, db
        )
    except InvalidPeriod as exc:
        raise HTTPException(
            status_code=422, detail=str(exc)
        ) from exc


@router.get(
    "/budget/recommendations",
    response_model=list[RecommendationRead],
)
async def list_recommendations(
    period: str,
    user: UserDep,
    db: DbSession,
):
    return await budget_service.list_recommendations(
        user.id, period, db
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
    try:
        return await budget_service.update_recommendation_status(
            user.id, recommendation_id, status, db
        )
    except NotFound as exc:
        raise HTTPException(
            status_code=404, detail=str(exc)
        ) from exc
    except Conflict as exc:
        raise HTTPException(
            status_code=409, detail=str(exc)
        ) from exc


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
    try:
        return await budget_service.get_budget(
            user.id, period, db
        )
    except NotFound as exc:
        raise HTTPException(
            status_code=404, detail=str(exc)
        ) from exc


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
    try:
        return await budget_service.decide_budget(
            user.id,
            period,
            payload.accepted_total,
            payload.accepted_savings,
            db,
        )
    except NotFound as exc:
        raise HTTPException(
            status_code=404, detail=str(exc)
        ) from exc
    except InvalidPeriod as exc:
        raise HTTPException(
            status_code=422, detail=str(exc)
        ) from exc
    except BusinessRule as exc:
        raise HTTPException(
            status_code=422, detail=str(exc)
        ) from exc
