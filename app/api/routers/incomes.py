from datetime import date

from fastapi import APIRouter, status

from app.api.deps import DbSession, UserDep
from app.schemas.common import IncomeCreate, IncomeRead
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


@router.get("", response_model=list[IncomeRead])
async def list_incomes(
    user: UserDep,
    db: DbSession,
    from_date: date | None = None,
    to_date: date | None = None,
):
    return await income_service.list_by_user(
        user.id, db, from_date, to_date
    )
