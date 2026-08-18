from datetime import date
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.deps import DbSession, UserDep
from app.models import Category, Expense
from app.schemas.common import ExpenseCreate, ExpenseRead

router = APIRouter(
    prefix="/users/{user_id}/expenses", tags=["expenses"]
)

_NOT_FOUND = {404: {"description": "Ressource introuvable"}}


@router.post(
    "",
    response_model=ExpenseRead,
    status_code=status.HTTP_201_CREATED,
    responses=_NOT_FOUND,
)
async def create_expense(
    payload: ExpenseCreate,
    user: UserDep,
    db: DbSession,
):
    category = await db.get(Category, payload.category_id)
    if not category or category.user_id != user.id:
        raise HTTPException(
            status_code=404, detail="Category not found"
        )
    expense = Expense(user_id=user.id, **payload.model_dump())
    db.add(expense)
    await db.commit()
    await db.refresh(expense)
    return expense


@router.get("", response_model=list[ExpenseRead])
async def list_expenses(
    user: UserDep,
    db: DbSession,
    from_date: date | None = None,
    to_date: date | None = None,
    category_id: UUID | None = None,
):
    query = select(Expense).where(Expense.user_id == user.id)
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
    return result.scalars().all()


@router.put(
    "/{expense_id}",
    response_model=ExpenseRead,
    responses=_NOT_FOUND,
)
async def update_expense(
    expense_id: UUID,
    payload: ExpenseCreate,
    user: UserDep,
    db: DbSession,
):
    result = await db.execute(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.user_id == user.id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(
            status_code=404, detail="Expense not found"
        )
    category = await db.get(Category, payload.category_id)
    if not category or category.user_id != user.id:
        raise HTTPException(
            status_code=404, detail="Category not found"
        )
    for key, value in payload.model_dump().items():
        setattr(expense, key, value)
    await db.commit()
    await db.refresh(expense)
    return expense


@router.delete(
    "/{expense_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_NOT_FOUND,
)
async def delete_expense(
    expense_id: UUID,
    user: UserDep,
    db: DbSession,
):
    result = await db.execute(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.user_id == user.id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise HTTPException(
            status_code=404, detail="Expense not found"
        )
    await db.delete(expense)
    await db.commit()
