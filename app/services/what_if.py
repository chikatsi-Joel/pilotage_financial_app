from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, Expense
from app.schemas.common import WhatIfRead
from app.services.analytics import money
from app.services.analytics_service import get_period_totals, month_bounds


class NotFound(Exception):
    pass


def simulate_what_if(
    current_amount: Decimal,
    reduction_percent: Decimal,
    current_income: Decimal | None = None,
    current_expenses: Decimal | None = None,
) -> dict:
    new_target = money(current_amount * (Decimal("1") - reduction_percent / Decimal("100")))
    saving = money(current_amount - new_target)
    rate = None
    if current_income and current_income > 0 and current_expenses is not None:
        projected_expenses = max(Decimal("0"), current_expenses - saving)
        rate = money((current_income - projected_expenses) / current_income)
    return {
        "new_target": new_target,
        "monthly_saving": saving,
        "annual_saving": money(saving * Decimal("12")),
        "projected_savings_rate": rate,
    }


async def simulate(
    user_id: UUID,
    period: str,
    category_id: UUID,
    reduction_percent: Decimal,
    db: AsyncSession,
) -> WhatIfRead:
    start, end = month_bounds(period)

    category = await db.get(Category, category_id)
    if not category or category.user_id != user_id:
        raise NotFound("Category not found")

    amount_result = await db.execute(
        select(Expense.amount).where(
            Expense.user_id == user_id,
            Expense.category_id == category_id,
            Expense.expense_date.between(start, end),
        )
    )
    current_amount = sum(amount_result.scalars().all(), Decimal("0"))

    income, expenses = await get_period_totals(user_id, period, db)

    result = simulate_what_if(current_amount, reduction_percent, income, expenses)

    return WhatIfRead(
        period=period,
        category_name=category.name,
        current_amount=current_amount,
        reduction_percent=reduction_percent,
        **result,
    )
