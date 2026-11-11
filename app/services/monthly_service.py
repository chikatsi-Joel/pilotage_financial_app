"""Totaux de dépenses mois par mois (tendance saisonnière, historique)."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Expense
from app.schemas.common import MonthlyTotal
from app.services.analytics import money
from app.services.periods import month_bounds, recent_periods


def fill_months(periods: list[str], totals: dict[str, Decimal]) -> list[MonthlyTotal]:
    """Une entrée par période demandée, 0 pour les mois sans dépense."""
    return [MonthlyTotal(period=p, total=float(money(totals.get(p, Decimal("0"))))) for p in periods]


async def monthly_totals(
    user_id: UUID, period: str, months: int, db: AsyncSession
) -> list[MonthlyTotal]:
    """Dépenses totales des ``months`` derniers mois, finissant à ``period`` (inclus)."""
    periods = recent_periods(period, months)
    first, _ = month_bounds(periods[0])
    _, last = month_bounds(period)

    year = extract("year", Expense.expense_date)
    month = extract("month", Expense.expense_date)
    rows = await db.execute(
        select(year, month, func.sum(Expense.amount))
        .where(Expense.user_id == user_id, Expense.expense_date.between(first, last))
        .group_by(year, month)
    )
    totals = {f"{int(y):04d}-{int(m):02d}": Decimal(str(t)) for y, m, t in rows.all()}
    return fill_months(periods, totals)
