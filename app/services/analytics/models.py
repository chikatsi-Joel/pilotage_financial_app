from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import StrEnum


class CategoryType(StrEnum):
    ESSENTIAL = "essential"
    NON_ESSENTIAL = "non_essential"


class OptimizationPotential(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


@dataclass(frozen=True)
class Expense:
    amount: Decimal
    date: date
    category_id: str


@dataclass(frozen=True)
class Category:
    id: str
    name: str
    description: str
    type: CategoryType
    optimization_potential: OptimizationPotential


@dataclass(frozen=True)
class Forecast:
    method: str
    value: float
    mae: float | None


@dataclass(frozen=True)
class TimeSeriesProfile:
    level: float
    trend: float
    seasonality_strength: float
    volatility: float
    anomaly_score: float
    change_points: tuple[int, ...]
    drift_score: float
    confidence: float
    forecast: Forecast


@dataclass(frozen=True)
class CategoryAnalysis:
    category_id: str
    name: str
    description: str
    essential: bool
    current_amount: float
    baseline_amount: float
    expected_amount: float
    variation_percentage: float
    potential_saving: float
    opportunity_score: float
    profile: TimeSeriesProfile
