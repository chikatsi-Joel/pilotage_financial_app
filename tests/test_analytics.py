from decimal import Decimal

from app.models import ConfidenceLevel, DriftSignal, TrendDirection
from app.services.analytics import (
    SpendingMetrics,
    analyze_category,
    calculate_robust_baseline,
    reduction_rate,
    robust_z_score,
)


def test_robust_baseline_filters_outlier():
    values = [50.0, 55.0, 60.0, 500.0]
    baseline = calculate_robust_baseline(values)
    assert baseline < 100.0, (
        f"500 should be filtered out as outlier, got {baseline}"
    )


def test_strong_drift_is_detected_and_recommended_for_non_essential_high_optimizable_category():
    result = analyze_category(
        [Decimal("50000"), Decimal("52000"), Decimal("55000"),
         Decimal("51000"), Decimal("53000"), Decimal("54000")],
        Decimal("90000"),
        essential=False,
        optimization_potential="HIGH",
    )
    assert result.drift_signal == DriftSignal.STRONG_DRIFT
    assert result.confidence == ConfidenceLevel.HIGH
    assert result.estimated_saving > Decimal("0")


def test_essential_category_gets_no_automatic_reduction():
    assert reduction_rate("HIGH", Decimal("2"), essential=True) == Decimal("0")


def test_insufficient_history_is_low_confidence_and_has_no_baseline():
    result = analyze_category(
        [Decimal("100")], Decimal("200"), False, "HIGH"
    )
    assert result.baseline is None
    assert result.confidence == ConfidenceLevel.LOW
    assert result.drift_signal == DriftSignal.NORMAL


def test_robust_z_score_with_outlier():
    values = [10.0, 12.0, 11.0, 13.0, 100.0]
    score = robust_z_score(values, 100.0)
    assert score > 2.0, f"100 should be flagged as anomaly, got {score}"


def test_robust_z_score_with_normal_value():
    values = [10.0, 12.0, 11.0, 13.0, 12.0]
    score = robust_z_score(values, 12.0)
    assert abs(score) < 1.0, f"12.0 is normal, got z={score}"


def test_spending_metrics_model():
    m = SpendingMetrics(
        current_amount=Decimal("50000"),
        baseline_amount=Decimal("45000"),
        variation_percentage=11.1,
        transaction_count=15,
        trend_score=0.05,
        anomaly_score=0.1,
        drift_score=0.2,
        expected_amount=Decimal("47000"),
        deviation_amount=Decimal("3000"),
        deviation_percentage=6.4,
    )
    assert m.current_amount == Decimal("50000")
    assert m.drift_score == 0.2
