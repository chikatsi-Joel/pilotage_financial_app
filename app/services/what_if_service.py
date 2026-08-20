from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, Expense
from app.schemas.common import WhatIfRead
from app.services.analytics import money
from app.services.analytics_service import get_period_totals, month_bounds
from app.services.what_if import simulate_what_if


class NotFound(Exception):
    pass


async def simulate( user_id: UUID, period: str, category_id: UUID, reduction_percent: Decimal,
    db: AsyncSession,) -> WhatIfRead:
    start, end = month_bounds(period)

    category = await db.get(Category, category_id)
    if not category or category.user_id != user_id:
        raise NotFound("Category not found")

    amount_result = await db.execute(
        select(func.coalesce(func.sum(Expense.amount), Decimal("0"))).where(
            Expense.user_id == user_id,
            Expense.category_id == category_id,
            Expense.expense_date.between(start, end),
        )
    )
    current_amount = money(amount_result.scalar_one())

    income, expenses = await get_period_totals(user_id, period, db)

    result = simulate_what_if(current_amount, reduction_percent, income, expenses)

    return WhatIfRead(
        period=period,
        category_name=category.name,
        current_amount=current_amount,
        reduction_percent=reduction_percent,
        **result,
    )