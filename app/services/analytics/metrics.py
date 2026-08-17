from decimal import Decimal
from pydantic import BaseModel


class SpendingMetrics(BaseModel):

    current_amount: Decimal
    baseline_amount: Decimal

    variation_percentage: float

    transaction_count: int

    trend_score: float
    anomaly_score: float
    drift_score: float

    expected_amount: Decimal

    deviation_amount: Decimal
    deviation_percentage: float