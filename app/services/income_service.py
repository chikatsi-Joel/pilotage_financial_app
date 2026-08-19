from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Income
from app.schemas.common import IncomeCreate


async def create( user_id: UUID, payload: IncomeCreate, db: AsyncSession, ) -> Income:

    income = Income(user_id=user_id, **payload.model_dump())
    db.add(income)
    await db.commit()
    await db.refresh(income)
    return income

async def list_by_user(user_id: UUID, db: AsyncSession, from_date: date | None = None, to_date: date | None = None,
    cursor: date | None = None,  limit: int = 50,) -> list[Income]:

    query = select(Income).where(Income.user_id == user_id)

    if from_date:
        query = query.where(Income.income_date >= from_date)
    if to_date:
        query = query.where(Income.income_date <= to_date)
    if cursor:
        query = query.where(Income.income_date < cursor)
    query = query.order_by(Income.income_date.desc()).limit(limit)

    result = await db.execute(query)
    return list(result.scalars().all())