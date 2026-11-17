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
    """Prévision mensuelle (voir analytics/forecast.py).

    `value` : espérance du mois prévu (mois en cours s'il est en cours, sinon le suivant),
    probabilité d'utilisation incluse ; `mae`, `low`/`high` : erreur et fourchette à 80 %
    hors échantillon ; `usage_rate` : part des mois utilisés ; `projection` (+ bornes) : mois
    en cours seulement, déjà dépensé + reste attendu au rythme habituel.
    """

    method: str
    value: float
    mae: float | None
    low: float | None = None
    high: float | None = None
    usage_rate: float = 1.0
    projection: float | None = None
    projection_low: float | None = None
    projection_high: float | None = None


@dataclass(frozen=True)
class TimeSeriesProfile:
    level: float
    trend: float
    seasonality_strength: float
    seasonality_reliable: bool
    volatility: float
    anomaly_score: float
    change_points: tuple[int, ...]
    drift_score: float
    confidence: float
    forecast: Forecast
    history_months: int = 0
    last_change: float | None = None


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
