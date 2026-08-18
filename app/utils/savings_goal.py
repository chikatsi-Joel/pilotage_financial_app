from decimal import Decimal
from enum import StrEnum


class SavingsContributionTrend(StrEnum):
    UNKNOWN = "unknown"
    DECREASING = "decreasing"
    STABLE = "stable"
    INCREASING = "increasing"


def get_contribution_trend( values: list[Decimal], threshold: Decimal = Decimal("0.05"), ) -> SavingsContributionTrend:

    if not any(values):
        return SavingsContributionTrend.UNKNOWN
    if len(values) < 2:
        return SavingsContributionTrend.STABLE

    average = sum(values, Decimal("0")) / len(values)

    if not average:
        return SavingsContributionTrend.UNKNOWN

    change = (values[-1] - values[0]) / average
    if change > threshold:
        return SavingsContributionTrend.INCREASING
    if change < -threshold:
        return SavingsContributionTrend.DECREASING

    return SavingsContributionTrend.STABLE
