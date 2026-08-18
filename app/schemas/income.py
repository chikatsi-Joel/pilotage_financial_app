from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.base import ORMModel


class IncomeCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    income_date: date
    source: str = Field(min_length=1, max_length=160)
    recurring: bool = False


class IncomeRead(ORMModel):
    id: UUID
    amount: Decimal
    income_date: date
    source: str
    recurring: bool
