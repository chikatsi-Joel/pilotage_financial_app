from fastapi import APIRouter, HTTPException

from app.api.deps import DbSession, UserDep
from app.schemas.common import (
    CategoryAnalyticsRead,
    DashboardRead,
)
from app.services import analytics_service
from app.services.analytics_service import InvalidPeriod

router = APIRouter(
    prefix="/users/{user_id}/analytics",
    tags=["analytics"],
)


@router.get(
    "/categories",
    response_model=list[CategoryAnalyticsRead],
)
async def category_analytics(
    period: str,
    user: UserDep,
    db: DbSession,
):
    try:
        analytics = await analytics_service.compute_category_analytics(user.id, period, db)
    except InvalidPeriod as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return analytics


@router.get("/dashboard", response_model=DashboardRead)
async def dashboard(
    period: str,
    user: UserDep,
    db: DbSession,
):
    try:
        return await analytics_service.get_dashboard(user.id, period, db)
    except InvalidPeriod as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/refresh")
async def refresh_analytics(
    period: str,
    user: UserDep,
    db: DbSession,
):
    try:
        return await analytics_service.refresh_analytics(user.id, period, db)
    except InvalidPeriod as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
