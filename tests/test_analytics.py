from datetime import date
from decimal import Decimal

from app.services.analytics import (
    FinancialAnalyticsEngine,
    confidence,
    detect_change_points,
    drift_score,
    mad,
    money,
    residual_anomaly_score,
    robust_baseline,
    robust_center,
    robust_z,
    seasonality_strength,
    theil_sen_trend,
)
from app.services.analytics.models import (
    Category,
    CategoryType,
    Expense,
    OptimizationPotential,
)


def test_robust_baseline_filters_outlier():
    values = [50.0, 55.0, 60.0, 500.0]
    baseline = robust_baseline(values)
    assert baseline < 100.0, (
        f"500 should be filtered out as outlier, got {baseline}"
    )


def test_mad_filters_outlier():
    values = [10.0, 12.0, 11.0, 13.0, 100.0]
    m = mad(values)
    assert m < 5.0, f"MAD should be small, got {m}"


def test_confidence_increases_with_history():
    assert confidence(1) < confidence(6)
    assert confidence(12) == 1.0
    assert confidence(24) == 1.0


def test_theil_sen_trend_positive():
    values = [10.0, 11.0, 12.0, 13.0, 14.0]
    t = theil_sen_trend(values)
    assert t > 0, f"Expected positive trend, got {t}"


def test_theil_sen_trend_short():
    assert theil_sen_trend([10.0, 11.0]) == 0.0


def test_robust_z_normal():
    values = [10.0, 12.0, 11.0, 13.0, 12.0]
    z = robust_z(12.0, values)
    assert abs(z) < 1.0


def test_robust_z_outlier():
    values = [10.0, 12.0, 11.0, 13.0, 12.0]
    z = robust_z(100.0, values)
    assert z > 2.0


def test_robust_z_short_reference():
    assert robust_z(10.0, [1.0, 2.0]) == 0.0


def test_drift_score_short():
    assert drift_score([1.0, 2.0, 3.0]) == 0.0


def test_drift_score_detects_shift():
    values = [10.0] * 10 + [30.0] * 10
    d = drift_score(values)
    assert d > 0.5, f"Expected high drift, got {d}"


def test_change_points_empty_short():
    assert detect_change_points([1.0, 2.0]) == ()


def test_money_rounds():
    assert money(Decimal("10.005")) == Decimal("10.01")
    assert money(Decimal("10.004")) == Decimal("10.00")


def test_full_engine_analysis():
    expenses = [
        Expense(amount=Decimal("100"), date=date(2026, 1, 1), category_id="cat1"),
        Expense(amount=Decimal("110"), date=date(2026, 2, 1), category_id="cat1"),
        Expense(amount=Decimal("105"), date=date(2026, 3, 1), category_id="cat1"),
        Expense(amount=Decimal("115"), date=date(2026, 4, 1), category_id="cat1"),
        Expense(amount=Decimal("120"), date=date(2026, 5, 1), category_id="cat1"),
        Expense(amount=Decimal("130"), date=date(2026, 6, 1), category_id="cat1"),
        Expense(amount=Decimal("200"), date=date(2026, 7, 1), category_id="cat1"),
        Expense(amount=Decimal("250"), date=date(2026, 8, 1), category_id="cat1"),
    ]
    cat = Category(
        id="cat1", name="Test", description="",
        type=CategoryType.NON_ESSENTIAL,
        optimization_potential=OptimizationPotential.HIGH,
    )
    engine = FinancialAnalyticsEngine()
    result = engine.analyze_category(cat, expenses, 2026, 8)
    assert result is not None
    assert result.current_amount == 250.0
    assert result.baseline_amount > 0
    assert result.expected_amount >= 0
    assert result.opportunity_score > 0
    assert result.profile.confidence > 0
    assert result.profile.drift_score >= 0
    assert result.profile.forecast.method in (
        "naive", "ewma", "trend", "seasonal_naive"
    )


def test_engine_skips_empty_categories():
    engine = FinancialAnalyticsEngine()
    cat = Category(
        id="empty", name="Empty", description="",
        type=CategoryType.ESSENTIAL,
        optimization_potential=OptimizationPotential.LOW,
    )
    result = engine.analyze_category(cat, [], 2026, 8)
    assert result is None


def test_engine_analyze_sorts_by_opportunity_score():
    expenses = [
        Expense(amount=Decimal("50"), date=date(2026, 1, 1), category_id="c1"),
        Expense(amount=Decimal("50"), date=date(2026, 2, 1), category_id="c1"),
        Expense(amount=Decimal("50"), date=date(2026, 3, 1), category_id="c1"),
        Expense(amount=Decimal("50"), date=date(2026, 4, 1), category_id="c1"),
        Expense(amount=Decimal("50"), date=date(2026, 5, 1), category_id="c1"),
        Expense(amount=Decimal("50"), date=date(2026, 6, 1), category_id="c1"),
        Expense(amount=Decimal("200"), date=date(2026, 6, 1), category_id="c2"),
        Expense(amount=Decimal("200"), date=date(2026, 5, 1), category_id="c2"),
        Expense(amount=Decimal("200"), date=date(2026, 4, 1), category_id="c2"),
        Expense(amount=Decimal("200"), date=date(2026, 3, 1), category_id="c2"),
        Expense(amount=Decimal("200"), date=date(2026, 2, 1), category_id="c2"),
        Expense(amount=Decimal("200"), date=date(2026, 1, 1), category_id="c2"),
    ]
    cats = [
        Category(id="c1", name="Essential", description="",
                 type=CategoryType.ESSENTIAL,
                 optimization_potential=OptimizationPotential.LOW),
        Category(id="c2", name="NonEssential", description="",
                 type=CategoryType.NON_ESSENTIAL,
                 optimization_potential=OptimizationPotential.HIGH),
    ]
    engine = FinancialAnalyticsEngine()
    results = engine.analyze(cats, expenses, 2026, 6)
    assert len(results) == 2
    assert results[0].opportunity_score >= results[1].opportunity_score
