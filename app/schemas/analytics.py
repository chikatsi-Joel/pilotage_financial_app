from uuid import UUID

from pydantic import BaseModel


class ForecastRead(BaseModel):
    method: str
    value: float
    mae: float | None


class TimeSeriesProfileRead(BaseModel):
    level: float
    trend: float
    seasonality_strength: float
    seasonality_reliable: bool
    volatility: float
    anomaly_score: float
    change_points: tuple[int, ...]
    drift_score: float
    confidence: float
    forecast: ForecastRead


class CategoryAnalyticsRead(BaseModel):
    category_id: UUID
    name: str
    description: str
    period: str
    essential: bool
    current_amount: float
    baseline_amount: float
    expected_amount: float
    variation_percentage: float
    potential_saving: float
    opportunity_score: float
    profile: TimeSeriesProfileRead
