from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
from decimal import Decimal, ROUND_HALF_UP

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
    return Decimal(str(value)).quantize(
        CENT, rounding=ROUND_HALF_UP
    )


YearMonth = tuple[int, int]
# Total mensuel par catégorie : {category_id: {(année, mois): total}}
MonthlyTotals = Mapping[str, Mapping[YearMonth, float]]


class FinancialAnalyticsEngine:

    @staticmethod
    def group_monthly(
        expenses: Iterable[Expense],
    ) -> dict[str, dict[YearMonth, float]]:
        """Totaux mensuels par catégorie, en un seul passage sur les dépenses (O(n))."""
        grouped: dict[str, dict[YearMonth, float]] = defaultdict(
            lambda: defaultdict(float)
        )
        for e in expenses:
            grouped[e.category_id][(e.date.year, e.date.month)] += float(
                e.amount
            )
        return grouped

    def monthly_series(
        self, category_id: str, expenses: list[Expense]
    ) -> list[float]:
        monthly = self.group_monthly(expenses).get(category_id, {})
        return [v for _, v in sorted(monthly.items())]

    def analyze_category(
        self,
        category: Category,
        expenses: list[Expense],
        year: int,
        month: int,
    ) -> CategoryAnalysis | None:
        return self.analyze_category_monthly(
            category,
            self.group_monthly(expenses).get(category.id, {}),
            year,
            month,
        )

    def analyze_category_monthly(
        self,
        category: Category,
        monthly: Mapping[YearMonth, float],
        year: int,
        month: int,
    ) -> CategoryAnalysis | None:
        """Analyse d'une catégorie à partir de ses totaux mensuels (mois sans dépense absents)."""
        values = [v for _, v in sorted(monthly.items())]
        if not values:
            return None

        current = monthly.get((year, month), 0)

        baseline = robust_baseline(values)
        trend = theil_sen_trend(values)
        expected = max(0, baseline * (1 + trend))

        variation = (
            (current - baseline) / baseline * 100
            if baseline
            else 0
        )

        anomaly = residual_anomaly_score(values)
        drift = drift_score(values)
        seasonal, seasonal_reliable = seasonality_strength(values)
        volatility = mad(values) / max(
            abs(robust_center(values)), 1e-9
        )
        changes = detect_change_points(values)

        factor = {
            "low": 0.25,
            "medium": 0.60,
            "high": 1.0,
        }[category.optimization_potential.value]

        saving = max(0, current - expected) * factor

        persistent = min(
            max(variation, 0) / 100
            + max(trend, 0)
            + drift,
            1,
        )

        w_s = settings.weight_saving
        w_p = settings.weight_persistent
        w_a = settings.weight_anomaly
        essential_factor = (
            0.25 if category.type.value == "essential" else 1
        )
        score_val = min(
            max(
                (
                    w_s * (saving / max(current, 1))
                    + w_p * persistent
                    + w_a * min(anomaly / 3, 1)
                )
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
            history_months=len(values),
            last_change=(
                (values[-1] - values[-2]) / abs(values[-2])
                if len(values) >= 2 and values[-2]
                else None
            ),
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

    def analyze(
        self,
        categories: list[Category],
        expenses: list[Expense],
        year: int,
        month: int,
    ) -> list[CategoryAnalysis]:
        return self.analyze_monthly(
            categories, self.group_monthly(expenses), year, month
        )

    def analyze_monthly(
        self,
        categories: list[Category],
        monthly_totals: MonthlyTotals,
        year: int,
        month: int,
    ) -> list[CategoryAnalysis]:
        """Analyse toutes les catégories en O(catégories + mois) à partir des totaux mensuels."""
        result = [
            a
            for c in categories
            if (
                a := self.analyze_category_monthly(
                    c, monthly_totals.get(c.id, {}), year, month
                )
            )
            is not None
        ]
        return sorted(
            result,
            key=lambda x: x.opportunity_score,
            reverse=True,
        )
