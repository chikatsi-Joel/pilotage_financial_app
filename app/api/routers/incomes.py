from datetime import date

from fastapi import APIRouter, Query, status

from app.api.deps import DbSession, UserDep
from app.schemas.common import IncomeCreate, IncomeRead, PaginatedResponse
from app.services import income_service

router = APIRouter(
    prefix="/users/{user_id}/incomes", tags=["incomes"]
)


@router.post(
    "",
    response_model=IncomeRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_income(
    payload: IncomeCreate,
    user: UserDep,
    db: DbSession,
):
    return await income_service.create(user.id, payload, db)


@router.get("", response_model=PaginatedResponse[IncomeRead])
async def list_incomes(
    user: UserDep,
    db: DbSession,
    from_date: date | None = None,
    to_date: date | None = None,
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
):
    items, next_cursor, has_more = await income_service.list_by_user(
        user.id, db, from_date, to_date,
        cursor=cursor, limit=limit,
    )
    return PaginatedResponse(
        items=items, next_cursor=next_cursor, has_more=has_more,
    )
