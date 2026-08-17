from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_user
from app.db.session import get_db
from app.models import Income, User
from app.schemas.common import IncomeCreate, IncomeRead

router = APIRouter(prefix="/users/{user_id}/incomes", tags=["incomes"])


@router.post("", response_model=IncomeRead, status_code=status.HTTP_201_CREATED)
async def create_income(payload: IncomeCreate, user: User = Depends(get_user), db: AsyncSession = Depends(get_db)):
    income = Income(user_id=user.id, **payload.model_dump())
    db.add(income)
    await db.commit()
    await db.refresh(income)
    return income


@router.get("", response_model=list[IncomeRead])
async def list_incomes(user: User = Depends(get_user), from_date: date | None = None, to_date: date | None = None, db: AsyncSession = Depends(get_db)):
    query = select(Income).where(Income.user_id == user.id)
    if from_date:
        query = query.where(Income.income_date >= from_date)
    if to_date:
        query = query.where(Income.income_date <= to_date)
    query = query.order_by(Income.income_date.desc())
    result = await db.execute(query)
    return result.scalars().all()
