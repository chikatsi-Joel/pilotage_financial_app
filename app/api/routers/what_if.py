from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_user
from app.api.routers.analytics import month_bounds
from app.db.session import get_db
from app.models import Category, Expense, Income, User
from app.schemas.common import WhatIfRead, WhatIfRequest
from app.services.what_if import simulate_what_if

router = APIRouter(prefix="/users/{user_id}/what-if", tags=["what-if"])


@router.post("", response_model=WhatIfRead)
async def what_if(period: str, payload: WhatIfRequest, user: User = Depends(get_user), db: AsyncSession = Depends(get_db)):
    start, end = month_bounds(period)
    category = await db.get(Category, payload.category_id)
    if not category or category.user_id != user.id:
        raise HTTPException(status_code=404, detail="Category not found")

    amount_result = await db.execute(select(Expense.amount).where(
        Expense.user_id == user.id, Expense.category_id == payload.category_id,
        Expense.expense_date.between(start, end),
    ))

    current_amount = sum(amount_result.scalars().all(), Decimal("0"))
    income_result = await db.execute(select(Income.amount).where(Income.user_id == user.id, Income.income_date.between(start, end)))
    income = sum(income_result.scalars().all(), Decimal("0"))
    expense_result = await db.execute(select(Expense.amount).where(Expense.user_id == user.id, Expense.expense_date.between(start, end)))
    expenses = sum(expense_result.scalars().all(), Decimal("0"))
    result = simulate_what_if(current_amount, payload.reduction_percent, income, expenses)

    return WhatIfRead(period=period, category_name=category.name, current_amount=current_amount,
                      reduction_percent=payload.reduction_percent, **result)
