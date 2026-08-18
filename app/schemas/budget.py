from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class RecommendationRead(BaseModel):
    id: UUID
    category_id: UUID
    category_name: str
    period: str
    impact_estimated: Decimal
    justification: str
    status: str


class BudgetCategoryLine(BaseModel):
    category_id: UUID
    category_name: str
    current: Decimal
    baseline: float
    recommended: Decimal
    essential: bool
    reduction: Decimal
    reason: str


class BudgetDecision(BaseModel):
    accepted_total: Decimal = Field(gt=0)
    accepted_savings: Decimal = Field(ge=0)


class BudgetRead(BaseModel):
    period: str
    projected_income: Decimal
    current_expenses: Decimal
    recommended_expenses: Decimal
    current_savings: Decimal
    recommended_savings: Decimal
    target_savings: Decimal | None
    potential_savings: Decimal
    target_gap: Decimal
    categories: list[BudgetCategoryLine]
    rationale: str
