from enum import StrEnum


class CategoryType(StrEnum):
    EXPENSE = "EXPENSE"


class Essentiality(StrEnum):
    ESSENTIAL = "ESSENTIAL"
    NON_ESSENTIAL = "NON_ESSENTIAL"


class OptimizationPotential(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class ConfidenceLevel(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class DriftSignal(StrEnum):
    NORMAL = "NORMAL"
    ATTENTION = "ATTENTION"
    STRONG_DRIFT = "STRONG_DRIFT"


class TrendDirection(StrEnum):
    DECREASING = "DECREASING"
    STABLE = "STABLE"
    INCREASING = "INCREASING"


class RecommendationStatus(StrEnum):
    PROPOSED = "PROPOSED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    ADJUSTED = "ADJUSTED"
