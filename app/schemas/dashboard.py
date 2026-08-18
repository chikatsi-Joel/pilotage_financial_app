from decimal import Decimal

from pydantic import BaseModel

from app.schemas.analytics import CategoryAnalyticsRead


class DashboardRead(BaseModel):
    period: str
    income: Decimal
    expenses: Decimal
    savings: Decimal
    savings_rate: Decimal
    categories_in_drift: int
    potential_savings: Decimal
    top_drift_categories: list[CategoryAnalyticsRead]
