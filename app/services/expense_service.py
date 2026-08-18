from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, Expense
from app.schemas.common import ExpenseCreate


class NotFound(Exception):
    pass


async def create(
    user_id: UUID,
    payload: ExpenseCreate,
    db: AsyncSession,
) -> Expense:
    category = await db.get(Category, payload.category_id)
    if not category or category.user_id != user_id:
        raise NotFound("Category not found")

    expense = Expense(user_id=user_id, **payload.model_dump())
    db.add(expense)
    await db.commit()
    await db.refresh(expense)
    return expense


async def list_by_user(
    user_id: UUID,
    db: AsyncSession,
    from_date: date | None = None,
    to_date: date | None = None,
    category_id: UUID | None = None,
) -> list[Expense]:
    query = select(Expense).where(Expense.user_id == user_id)
    if from_date:
        query = query.where(Expense.expense_date >= from_date)
    if to_date:
        query = query.where(Expense.expense_date <= to_date)
    if category_id:
        query = query.where(Expense.category_id == category_id)
    query = query.order_by(
        Expense.expense_date.desc(), Expense.created_at.desc()
    )
    result = await db.execute(query)
    return list(result.scalars().all())


async def update(
    user_id: UUID,
    expense_id: UUID,
    payload: ExpenseCreate,
    db: AsyncSession,
) -> Expense:
    result = await db.execute(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.user_id == user_id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise NotFound("Expense not found")

    category = await db.get(Category, payload.category_id)
    if not category or category.user_id != user_id:
        raise NotFound("Category not found")

    for key, value in payload.model_dump().items():
        setattr(expense, key, value)
    await db.commit()
    await db.refresh(expense)
    return expense


async def delete(
    user_id: UUID,
    expense_id: UUID,
    db: AsyncSession,
) -> None:
    result = await db.execute(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.user_id == user_id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise NotFound("Expense not found")

    await db.delete(expense)
    await db.commit()
