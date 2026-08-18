from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class WhatIfRequest(BaseModel):
    category_id: UUID
    reduction_percent: Decimal = Field(ge=0, le=100)


class WhatIfRead(BaseModel):
    period: str
    category_name: str
    current_amount: Decimal
    reduction_percent: Decimal
    new_target: Decimal
    monthly_saving: Decimal
    annual_saving: Decimal
    projected_savings_rate: Decimal | None
