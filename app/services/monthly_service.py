"""Totaux mois par mois (tendance saisonnière, historique) : dépenses, revenus, épargne."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.common import MonthlyTotal
from app.services.analytics import money
from app.services.analytics_service import period_totals_query
from app.services.periods import month_bounds, recent_periods


def fill_months(
    periods: list[str],
    totals: dict[str, Decimal],
    incomes: dict[str, Decimal] | None = None,
) -> list[MonthlyTotal]:
    """Une entrée par période demandée, 0 pour les mois sans dépense ni revenu."""
    out = []
    for p in periods:
        expense = money(totals.get(p, Decimal("0")))
        income = money((incomes or {}).get(p, Decimal("0")))
        out.append(
            MonthlyTotal(
                period=p,
                total=float(expense),
                income=float(income),
                savings=float(income - expense),
            )
        )
    return out


async def monthly_totals(
    user_id: UUID, period: str, months: int, db: AsyncSession
) -> list[MonthlyTotal]:
    """Totaux des ``months`` derniers mois finissant à ``period`` (inclus), en une requête.

    Mêmes règles que le dashboard (revenu récurrent compté chaque mois depuis son début) :
    les chiffres d'un mois sont identiques dans les deux écrans.
    """
    periods = recent_periods(period, months)
    row = (
        await db.execute(period_totals_query(user_id, [month_bounds(p) for p in periods]))
    ).one()
    incomes = {p: Decimal(str(row[2 * i])) for i, p in enumerate(periods)}
    expenses = {p: Decimal(str(row[2 * i + 1])) for i, p in enumerate(periods)}
    return fill_months(periods, expenses, incomes)
