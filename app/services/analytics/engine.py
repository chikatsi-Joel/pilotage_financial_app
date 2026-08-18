from __future__ import annotations

from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal

from app.core.config import settings
from app.services.analytics.forecast import forecast
from app.services.analytics.models import (
    Category,
    CategoryAnalysis,
    Expense,
    Forecast,
    TimeSeriesProfile,
)
from app.services.analytics.statistics import (
    confidence,
    mad,
    robust_baseline,
    robust_center,
    theil_sen_trend,
)
from app.services.analytics.time_series import (
    detect_change_points,
    drift_score,
    residual_anomaly_score,
    seasonality_strength,
)

CENT = Decimal("0.01")


def money(value: Decimal | float | int) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def monthly_series(category_id: str, expenses: list[Expense]) -> list[float]:
    grouped: dict[tuple[int, int], float] = defaultdict(float)
    for e in expenses:
        if e.category_id == category_id:
            grouped[(e.date.year, e.date.month)] += float(e.amount)
    return [v for _, v in sorted(grouped.items())]


def analyze_category(
    category: Category,
    expenses: list[Expense],
    year: int,
    month: int,
) -> CategoryAnalysis | None:
    values = monthly_series(category.id, expenses)
    if not values:
        return None

    current = sum(
        float(e.amount)
        for e in expenses
        if e.category_id == category.id and e.date.year == year and e.date.month == month
    )

    baseline = robust_baseline(values)
    trend = theil_sen_trend(values)
    expected = max(0, baseline * (1 + trend))

    variation = (current - baseline) / baseline * 100 if baseline else 0

    anomaly = residual_anomaly_score(values)
    drift = drift_score(values)
    seasonal, seasonal_reliable = seasonality_strength(values)
    volatility = mad(values) / max(abs(robust_center(values)), 1e-9)
    changes = detect_change_points(values)

    factor = {
        "low": 0.25,
        "medium": 0.60,
        "high": 1.0,
    }[category.optimization_potential.value]

    saving = max(0, current - expected) * factor

    persistent = min(
        max(variation, 0) / 100 + max(trend, 0) + drift,
        1,
    )

    w_s = settings.weight_saving
    w_p = settings.weight_persistent
    w_a = settings.weight_anomaly
    essential_factor = 0.25 if category.type.value == "essential" else 1
    score_val = min(
        max(
            (w_s * (saving / max(current, 1)) + w_p * persistent + w_a * min(anomaly / 3, 1))
            * essential_factor,
            0,
        ),
        1,
    )

    method, value, mae = forecast(values)
    profile = TimeSeriesProfile(
        level=baseline,
        trend=trend,
        seasonality_strength=seasonal,
        seasonality_reliable=seasonal_reliable,
        volatility=volatility,
        anomaly_score=anomaly,
        change_points=changes,
        drift_score=drift,
        confidence=confidence(values),
        forecast=Forecast(method, value, mae),
    )

    return CategoryAnalysis(
        category_id=category.id,
        name=category.name,
        description=category.description,
        essential=category.type.value == "essential",
        current_amount=current,
        baseline_amount=baseline,
        expected_amount=expected,
        variation_percentage=variation,
        potential_saving=saving,
        opportunity_score=score_val,
        profile=profile,
    )


def analyze_financial_data(
    categories: list[Category],
    expenses: list[Expense],
    year: int,
    month: int,
) -> list[CategoryAnalysis]:
    result = [
        a for c in categories if (a := analyze_category(c, expenses, year, month)) is not None
    ]
    return sorted(
        result,
        key=lambda x: x.opportunity_score,
        reverse=True,
    )


class FinancialAnalyticsEngine:
    """Class adapter maintaining backward compatibility for OO callers."""

    def monthly_series(self, category_id: str, expenses: list[Expense]) -> list[float]:
        return monthly_series(category_id, expenses)

    def analyze_category(
        self,
        category: Category,
        expenses: list[Expense],
        year: int,
        month: int,
    ) -> CategoryAnalysis | None:
        return analyze_category(category, expenses, year, month)

    def analyze(
        self,
        categories: list[Category],
        expenses: list[Expense],
        year: int,
        month: int,
    ) -> list[CategoryAnalysis]:
        return analyze_financial_data(categories, expenses, year, month)
