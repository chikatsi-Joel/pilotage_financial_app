from fastapi import APIRouter

from app.api.deps import DbSession, UserDep
from app.schemas.common import (
    CategoryAnalyticsRead,
    DashboardRead,
)
from app.services import analytics_service

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
    analytics = await analytics_service.get_category_analytics_snapshot(
        user.id, period, db
    )
    return analytics


@router.get("/dashboard", response_model=DashboardRead)
async def dashboard(
    period: str,
    user: UserDep,
    db: DbSession,
):
    return await analytics_service.get_dashboard_snapshot(
        user.id, period, db
    )
@router.post("/refresh")
async def refresh_analytics(
    period: str,
    user: UserDep,
    db: DbSession,
):
    return await analytics_service.refresh_analytics(
        user.id, period, db
    )