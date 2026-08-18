from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.base import ORMModel


class ExpenseCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    category_id: UUID
    expense_date: date
    note: str | None = Field(default=None, max_length=2000)


class ExpenseRead(ORMModel):
    id: UUID
    category_id: UUID
    amount: Decimal
    expense_date: date
    note: str | None
