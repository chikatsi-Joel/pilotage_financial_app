"""Helpers de périodes mensuelles (format ``YYYY-MM``), partagés par les services."""

from __future__ import annotations

from calendar import monthrange
from datetime import date

from app.services.errors import InvalidPeriod


def parse_period(period: str) -> tuple[int, int]:
    """Renvoie ``(année, mois)`` ou lève ``InvalidPeriod``."""
    try:
        year, month = map(int, period.split("-"))
        date(year, month, 1)
    except (ValueError, TypeError, AttributeError) as exc:
        raise InvalidPeriod("period must be YYYY-MM") from exc
    return year, month


def period_of(d: date) -> str:
    """Période ``YYYY-MM`` d'une date."""
    return f"{d.year:04d}-{d.month:02d}"


def month_bounds(period: str) -> tuple[date, date]:
    """Premier et dernier jour du mois."""
    year, month = parse_period(period)
    return date(year, month, 1), date(year, month, monthrange(year, month)[1])


def shift_period(period: str, months: int = -1) -> str:
    """Décale une période de ``months`` mois (négatif = passé)."""
    year, month = parse_period(period)
    index = year * 12 + (month - 1) + months
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def recent_periods(period: str, count: int = 6) -> list[str]:
    """Les ``count`` dernières périodes finissant à ``period``, de la plus ancienne à la plus récente."""
    return [shift_period(period, -i) for i in range(count - 1, -1, -1)]
