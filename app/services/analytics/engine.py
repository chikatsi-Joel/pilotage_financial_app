from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable, Mapping
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
    relative_gap,
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
        up_to_day: int | None = None,
    ) -> dict[str, dict[YearMonth, float]]:
        """Totaux mensuels par catégorie, en un seul passage sur les dépenses (O(n)).

        Avec `up_to_day`, seules les dépenses du 1er au jour `up_to_day` de chaque mois
        comptent (totaux « à date équivalente »).
        """
        grouped: dict[str, dict[YearMonth, float]] = defaultdict(
            lambda: defaultdict(float)
        )
        for e in expenses:
            if up_to_day is not None and e.date.day > up_to_day:
                continue
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
        as_of_day: int | None = None,
    ) -> CategoryAnalysis | None:
        to_date = (
            self.group_monthly(expenses, as_of_day).get(category.id, {})
            if as_of_day is not None
            else None
        )
        return self.analyze_category_monthly(
            category,
            self.group_monthly(expenses).get(category.id, {}),
            year,
            month,
            to_date,
            as_of_day,
        )

    def analyze_category_monthly(
        self,
        category: Category,
        monthly: Mapping[YearMonth, float],
        year: int,
        month: int,
        monthly_to_date: Mapping[YearMonth, float] | None = None,
        as_of_day: int | None = None,
    ) -> CategoryAnalysis | None:
        """Analyse d'une catégorie à partir de ses totaux mensuels (mois sans dépense absents).

        Sémantique des écarts (unique, reprise telle quelle par le cache) :
        - `baseline_amount` : habitude mensuelle = niveau des mois **où la catégorie est
          utilisée**, parmi ceux qui précèdent la période (le mois analysé n'entre pas dans
          sa propre référence). Les mois sans dépense ne comptent pas : avec un estimateur
          EWMA, des 0 intercalés feraient chuter l'habitude et créeraient de fausses alertes ;
        - `expected_amount` : dépense normale **à la même date** du mois. Pour un mois en
          cours (`as_of_day` renseigné), habitude des totaux du 1er au jour `as_of_day` de ces
          mêmes mois d'utilisation (`monthly_to_date`, 0 si rien n'était encore dépensé à
          cette date) : un loyer payé le 1er ne ressort pas comme une hausse le 2. Pour un
          mois clôturé, égale à `baseline_amount` ;
        - `variation_percentage` : écart de la dépense à `expected_amount`, 0 sans référence.
        """
        if not monthly:
            return None

        period = (year, month)
        current = monthly.get(period, 0)
        history = sorted(k for k in monthly if k < period)
        baseline = robust_baseline([monthly[k] for k in history])
        if as_of_day is not None and monthly_to_date is not None:
            expected = robust_baseline([monthly_to_date.get(k, 0) for k in history])
        else:
            expected = baseline

        # Profil (tendance, dérive, prévision…) : mois passés avec dépense, plus le mois
        # analysé seulement s'il est clôturé (un mois partiel fausserait la série).
        values = [v for k, v in sorted(monthly.items()) if k < period]
        if as_of_day is None and period in monthly:
            values.append(current)
        if not values:
            values = [current]

        trend = theil_sen_trend(values)
        variation = relative_gap(current, expected)
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
        as_of_day: int | None = None,
    ) -> list[CategoryAnalysis]:
        return self.analyze_monthly(
            categories,
            self.group_monthly(expenses),
            year,
            month,
            self.group_monthly(expenses, as_of_day) if as_of_day is not None else None,
            as_of_day,
        )

    def analyze_monthly(
        self,
        categories: list[Category],
        monthly_totals: MonthlyTotals,
        year: int,
        month: int,
        monthly_to_date: MonthlyTotals | None = None,
        as_of_day: int | None = None,
    ) -> list[CategoryAnalysis]:
        """Analyse toutes les catégories en O(catégories + mois) à partir des totaux mensuels.

        `as_of_day` (mois en cours) et `monthly_to_date` (totaux du 1er à ce jour de chaque
        mois) activent la comparaison à date équivalente ; voir `analyze_category_monthly`.
        """
        to_date = monthly_to_date if as_of_day is not None else None
        result = [
            a
            for c in categories
            if (
                a := self.analyze_category_monthly(
                    c,
                    monthly_totals.get(c.id, {}),
                    year,
                    month,
                    to_date.get(c.id, {}) if to_date is not None else None,
                    as_of_day,
                )
            )
            is not None
        ]
        return sorted(
            result,
            key=lambda x: x.opportunity_score,
            reverse=True,
        )
