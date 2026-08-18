from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.base import ORMModel
from app.utils.savings_goal import SavingsContributionTrend


class SavingsGoalCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    target_amount: Decimal = Field(gt=0)
    deadline: date


class SavingsContributionRead(ORMModel):
    id: UUID
    amount: Decimal
    created_at: datetime


class SavingsGoalRead(ORMModel):
    id: UUID
    name: str
    description: str | None
    target_amount: Decimal
    deadline: date
    active: bool
    current_amount: Decimal
    contributions: list[SavingsContributionRead]


class SavingsGoalContribute(BaseModel):
    amount: Decimal = Field(gt=0)


class SavingsGoalContributeRead(BaseModel):
    goal_id: UUID
    goal_name: str
    amount: Decimal
    new_total: Decimal
    target_amount: Decimal
    completed: bool


class SavingsGoalAnalysis(BaseModel):
    goal_id: UUID
    name: str
    description: str | None

    target_amount: Decimal
    target_date: date

    current_amount: Decimal
    remaining_amount: Decimal
    progress_percentage: float

    contribution_count: int

    average_monthly_contribution: Decimal | None
    recent_monthly_contribution: Decimal | None
    contribution_trend: SavingsContributionTrend
    contribution_regularity: float | None

    required_monthly_contribution: Decimal | None
