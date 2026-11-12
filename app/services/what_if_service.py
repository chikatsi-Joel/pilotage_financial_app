from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, Expense
from app.schemas.common import WhatIfRead
from app.services.analytics import money
from app.services.analytics_service import get_period_totals
from app.services.errors import NotFound
from app.services.periods import month_bounds, period_of, shift_period
from app.services.what_if import reference_amount, simulate_what_if

HISTORY_MONTHS = 3


async def simulate( user_id: UUID, period: str, category_id: UUID, reduction_percent: Decimal,
    db: AsyncSession,) -> WhatIfRead:
    start, end = month_bounds(period)

    category = await db.get(Category, category_id)
    if not category or category.user_id != user_id:
        raise NotFound("Category not found")

    # Mois courant + HISTORY_MONTHS mois précédents : un seul GROUP BY mois
    first, _ = month_bounds(shift_period(period, -HISTORY_MONTHS))
    year = extract("year", Expense.expense_date)
    month = extract("month", Expense.expense_date)
    rows = await db.execute(
        select(year, month, func.sum(Expense.amount))
        .where(
            Expense.user_id == user_id,
            Expense.category_id == category_id,
            Expense.expense_date.between(first, end),
        )
        .group_by(year, month)
    )
    spent = {f"{int(y):04d}-{int(m):02d}": total for y, m, total in rows.all()}

    def spent_in(p: str) -> Decimal:
        return money(spent.get(p, Decimal("0")))

    current_amount = spent_in(period_of(start))
    history = [
        spent_in(shift_period(period, -i)) for i in range(1, HISTORY_MONTHS + 1)
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