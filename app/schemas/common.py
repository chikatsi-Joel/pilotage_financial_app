from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    currency: str = Field(default="XAF", min_length=3, max_length=3)


class UserRead(ORMModel):
    id: UUID
    name: str
    currency: str


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


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    essentiality: str
    optimization_potential: str


class CategoryRead(ORMModel):
    id: UUID
    name: str
    category_type: str
    essentiality: str
    optimization_potential: str
    active: bool


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


class SavingsGoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    target_amount: Decimal = Field(gt=0)
    deadline: date
    current_amount: Decimal = Field(default=Decimal("0"), ge=0)


class SavingsGoalRead(ORMModel):
    id: UUID
    name: str
    target_amount: Decimal
    deadline: date
    current_amount: Decimal
    active: bool


class CategoryAnalyticsRead(BaseModel):
    category_id: UUID
    category_name: str
    period: str
    current: Decimal
    baseline: Decimal | None
    trend: Decimal
    trend_direction: str
    volatility: Decimal
    frequency: int
    deviation: Decimal
    drift_signal: str
    confidence: str
    essential: bool
    optimization_potential: str
    estimated_saving: Decimal


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
    baseline: Decimal | None
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


class DashboardRead(BaseModel):
    period: str
    income: Decimal
    expenses: Decimal
    savings: Decimal
    savings_rate: Decimal
    categories_in_drift: int
    potential_savings: Decimal
    top_drift_categories: list[CategoryAnalyticsRead]
