from decimal import Decimal

from app.services.savings_service import _contribution_regularity, _monthly_periods
from app.utils.savings_goal import (
    SavingsContributionTrend,
    get_contribution_trend,
)


def test_goal_analysis_uses_six_calendar_months() -> None:
    assert _monthly_periods("2026-01") == [
        "2025-08",
        "2025-09",
        "2025-10",
        "2025-11",
        "2025-12",
        "2026-01",
    ]


def test_goal_contribution_indicators_detect_growth_and_regularity() -> None:
    values = [
        Decimal("50000"),
        Decimal("60000"),
        Decimal("70000"),
        Decimal("80000"),
        Decimal("90000"),
        Decimal("100000"),
    ]
    assert get_contribution_trend(values) is SavingsContributionTrend.INCREASING
    assert _contribution_regularity(values) is not None
    assert _contribution_regularity(values) > 0.7


def test_goal_contribution_indicators_are_unknown_without_contributions() -> None:
    values = [Decimal("0")] * 6
    assert get_contribution_trend(values) is SavingsContributionTrend.UNKNOWN
    assert _contribution_regularity(values) is None
