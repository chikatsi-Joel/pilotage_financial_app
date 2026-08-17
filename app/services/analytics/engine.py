from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from app.core.config import settings
from app.models import ConfidenceLevel, DriftSignal, TrendDirection
from app.services.analytics.baseline import calculate_robust_baseline
from app.services.analytics.drift import calculate_cusum
from app.services.analytics.trends import calculate_trend

CENT = Decimal("0.01")


def money(value: Decimal | float | int) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def confidence_for_months(months: int) -> ConfidenceLevel:
    if months < 3:
        return ConfidenceLevel.LOW
    if months < 6:
        return ConfidenceLevel.MEDIUM
    return ConfidenceLevel.HIGH


def trend_direction(trend: float) -> TrendDirection:
    if trend > 0.05:
        return TrendDirection.INCREASING
    if trend < -0.05:
        return TrendDirection.DECREASING
    return TrendDirection.STABLE


def drift_signal(deviation: Decimal) -> DriftSignal:
    if abs(deviation) >= Decimal(str(settings.strong_deviation_threshold)):
        return DriftSignal.STRONG_DRIFT
    if abs(deviation) >= Decimal(str(settings.attention_deviation_threshold)):
        return DriftSignal.ATTENTION
    return DriftSignal.NORMAL


def reduction_rate(
    optimization_potential: str, deviation: Decimal, essential: bool
) -> Decimal:
    if essential:
        return Decimal("0")
    base = {
        "LOW": Decimal("0.05"),
        "MEDIUM": Decimal("0.10"),
        "HIGH": Decimal("0.20"),
    }[optimization_potential]
    if deviation >= Decimal(str(settings.strong_deviation_threshold)):
        base += Decimal("0.05")
    return min(base, Decimal("0.25"))


@dataclass(frozen=True)
class CategoryAnalysis:
    baseline: Decimal | None
    trend: Decimal
    volatility: Decimal
    deviation: Decimal
    confidence: ConfidenceLevel
    trend_direction: TrendDirection
    drift_signal: DriftSignal
    estimated_saving: Decimal


def analyze_category(
    historical_values: list[Decimal],
    current: Decimal,
    essential: bool,
    optimization_potential: str,
) -> CategoryAnalysis:
    history = [float(v) for v in historical_values if v >= 0]
    has_enough = len(history) >= settings.min_history_months_for_baseline

    baseline_raw = calculate_robust_baseline(history) if has_enough else None
    baseline = money(baseline_raw) if baseline_raw is not None else None

    confidence = confidence_for_months(len(history))

    if baseline is None or baseline == Decimal("0"):
        deviation = Decimal("0")
    else:
        deviation = (current - baseline) / baseline

    trend_float = calculate_trend(history) if len(history) >= 2 else 0.0
    trend = Decimal(str(trend_float)).quantize(Decimal("0.000001"))

    cusum = calculate_cusum(history)
    volatility = Decimal(str(cusum)).quantize(Decimal("0.000001"))

    signal = drift_signal(deviation) if has_enough else DriftSignal.NORMAL

    saving_rate = reduction_rate(optimization_potential, deviation, essential)
    estimated_saving = money(current * saving_rate)

    return CategoryAnalysis(
        baseline=baseline,
        trend=trend,
        volatility=volatility,
        deviation=deviation.quantize(Decimal("0.000001")),
        confidence=confidence,
        trend_direction=trend_direction(trend_float),
        drift_signal=signal,
        estimated_saving=estimated_saving,
    )
