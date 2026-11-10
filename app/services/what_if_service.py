from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, Expense
from app.schemas.common import WhatIfRead
from app.services.analytics import money
from app.services.analytics_service import get_period_totals
from app.services.errors import NotFound
from app.services.periods import month_bounds, shift_period
from app.services.what_if import reference_amount, simulate_what_if

HISTORY_MONTHS = 3


async def simulate( user_id: UUID, period: str, category_id: UUID, reduction_percent: Decimal,
    db: AsyncSession,) -> WhatIfRead:
    start, end = month_bounds(period)

    category = await db.get(Category, category_id)
    if not category or category.user_id != user_id:
        raise NotFound("Category not found")

    async def spent(first, last) -> Decimal:
        res = await db.execute(
            select(func.coalesce(func.sum(Expense.amount), Decimal("0"))).where(
                Expense.user_id == user_id,
                Expense.category_id == category_id,
                Expense.expense_date.between(first, last),
            )
        )
        return money(res.scalar_one())

    current_amount = await spent(start, end)
    history = [
        await spent(*month_bounds(shift_period(period, -i)))
        for i in range(1, HISTORY_MONTHS + 1)
    ]
    reference, basis = reference_amount(current_amount, history)

    income, expenses = await get_period_totals(user_id, period, db)

    result = simulate_what_if(reference, reduction_percent, income, expenses)

    return WhatIfRead(
        period=period,
        category_name=category.name,
        current_amount=current_amount,
        reference_amount=reference,
        reference_basis=basis,
        reduction_percent=reduction_percent,
        **result,
    )