from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.utils.savings_goal import SavingsContributionTrend


class PaginatedResponse[T](BaseModel):
    items: list[T]
    next_cursor: str | None = None
    has_more: bool = False


class CursorParams(BaseModel):
    cursor: str | None = Field(default=None, description="ID of last item from previous page")
    limit: int = Field(default=20, ge=1, le=100, description="Items per page")


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
    amount: float
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


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    essentiality: str | None = None
    optimization_potential: str | None = None
    active: bool | None = None


class ExpenseCreate(BaseModel):
    amount: Decimal = Field(gt=0)
    category_id: UUID
    expense_date: date
    note: str | None = Field(default=None, max_length=2000)


class ExpenseRead(ORMModel):
    id: UUID
    category_id: UUID
    amount: float
    expense_date: date
    note: str | None


class SavingsGoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2_000)
    target_amount: Decimal = Field(gt=0)
    deadline: date


class SavingsContributionRead(ORMModel):
    id: UUID
    amount: float
    created_at: datetime


class SavingsGoalRead(ORMModel):
    id: UUID
    name: str
    description: str | None
    target_amount: float
    deadline: date
    active: bool
    current_amount: float
    contributions: list[SavingsContributionRead]


class SavingsGoalContribute(BaseModel):
    amount: Decimal = Field(gt=0)


class SavingsGoalContributeRead(BaseModel):
    goal_id: UUID
    goal_name: str
    amount: float
    new_total: float
    target_amount: float
    completed: bool


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


class RecommendationRead(BaseModel):
    id: UUID
    category_id: UUID
    category_name: str
    period: str
    impact_estimated: float
    justification: str
    status: str


class BudgetCategoryLine(BaseModel):
    category_id: UUID
    category_name: str
    current: float
    baseline: float
    recommended: float
    essential: bool
    reduction: float
    reason: str


class BudgetDecision(BaseModel):
    accepted_total: Decimal = Field(gt=0)
    accepted_savings: Decimal = Field(ge=0)


class BudgetRead(BaseModel):
    period: str
    projected_income: float
    current_expenses: float
    recommended_expenses: float
    current_savings: float
    recommended_savings: float
    target_savings: float | None
    potential_savings: float
    target_gap: float
    categories: list[BudgetCategoryLine]
    rationale: str


class WhatIfRequest(BaseModel):
    category_id: UUID
    reduction_percent: Decimal = Field(ge=0, le=100)


class WhatIfRead(BaseModel):
    period: str
    category_name: str
    current_amount: float
    reduction_percent: float
    new_target: float
    monthly_saving: float
    annual_saving: float
    projected_savings_rate: float | None


class WeeklyExpenseRead(BaseModel):
    label: str
    prevu: float
    reel: float


class SavingsGoalSummary(BaseModel):
    name: str
    target_amount: float
    current_amount: float
    progress_percentage: float


class DashboardRead(BaseModel):
    period: str
    income: float
    expenses: float
    savings: float
    savings_rate: float
    categories_in_drift: int
    potential_savings: float
    top_drift_categories: list[CategoryAnalyticsRead]
    weekly: list[WeeklyExpenseRead]
    sparkline: list[float]
    monthly_variation: float | None
    savings_goal: SavingsGoalSummary | None


class SavingsGoalAnalysis(BaseModel):
    goal_id: UUID
    name: str
    description: str | None

    target_amount: float
    target_date: date

    current_amount: float
    remaining_amount: float
    progress_percentage: float

    contribution_count: int

    average_monthly_contribution: float | None
    recent_monthly_contribution: float | None
    contribution_trend: SavingsContributionTrend
    contribution_regularity: float | None

    required_monthly_contribution: float | None