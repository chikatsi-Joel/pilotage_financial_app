from datetime import date

from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import DbSession, UserDep
from app.models import Income
from app.schemas.common import IncomeCreate, IncomeRead

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
    income = Income(
        user_id=user.id, **payload.model_dump()
    )
    db.add(income)
    await db.commit()
    await db.refresh(income)
    return income


@router.get("", response_model=list[IncomeRead])
async def list_incomes(
    user: UserDep,
    db: DbSession,
    from_date: date | None = None,
    to_date: date | None = None,
):
    query = select(Income).where(
        Income.user_id == user.id
    )
    if from_date:
        query = query.where(
            Income.income_date >= from_date
        )
    if to_date:
        query = query.where(
            Income.income_date <= to_date
        )
    query = query.order_by(Income.income_date.desc())
    result = await db.execute(query)
    return result.scalars().all()
