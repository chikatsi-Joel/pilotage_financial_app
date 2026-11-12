import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, Date, DateTime, Enum, ForeignKey, Index, Integer, Numeric, String, Text,
    UniqueConstraint, Uuid, desc, func,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.db.base import Base


class CategoryType(str, enum.Enum):
    EXPENSE = "EXPENSE"


class Essentiality(str, enum.Enum):
    ESSENTIAL = "ESSENTIAL"
    NON_ESSENTIAL = "NON_ESSENTIAL"


class OptimizationPotential(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class ConfidenceLevel(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class DriftSignal(str, enum.Enum):
    NORMAL = "NORMAL"
    ATTENTION = "ATTENTION"
    STRONG_DRIFT = "STRONG_DRIFT"


class TrendDirection(str, enum.Enum):
    DECREASING = "DECREASING"
    STABLE = "STABLE"
    INCREASING = "INCREASING"


class RecommendationStatus(str, enum.Enum):
    PROPOSED = "PROPOSED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    ADJUSTED = "ADJUSTED"


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="XAF")
    email: Mapped[str | None] = mapped_column(String(254), unique=True, index=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Compte Firebase rattaché (uid), renseigné à la première connexion via Firebase.
    firebase_uid: Mapped[str | None] = mapped_column(String(128), unique=True, index=True, nullable=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    email_code_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    email_code_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    email_code_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    email_code_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    incomes: Mapped[list["Income"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    categories: Mapped[list["Category"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    expenses: Mapped[list["Expense"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    savings_goals: Mapped[list["SavingsGoal"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class AuthSession(Base):
    """Session d'appareil : le jeton n'expire jamais, seule la déconnexion le révoque."""

    __tablename__ = "auth_sessions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    device: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PushDevice(Base):
    """Appareil enregistré pour recevoir des notifications push (jeton Expo)."""

    __tablename__ = "push_devices"
    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    platform: Mapped[str] = mapped_column(String(16), nullable=False, default="unknown")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    budget_alerts: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    savings_milestones: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    daily_reminder: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    daily_reminder_hour: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    weekly_summary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ai_insights: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")


class NotificationLog(Base):
    """Notifications déjà envoyées : la clé unique empêche les doublons."""

    __tablename__ = "notification_log"
    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_notification_user_key"),)


class Income(Base):
    __tablename__ = "incomes"
    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    income_date: Mapped[date] = mapped_column(Date, nullable=False)
    source: Mapped[str] = mapped_column(String(160), nullable=False)
    recurring: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped[User] = relationship(back_populates="incomes")
    __table_args__ = (Index("ix_income_user_date", "user_id", "income_date"),)


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category_type: Mapped[CategoryType] = mapped_column(Enum(CategoryType), nullable=False, default=CategoryType.EXPENSE)
    essentiality: Mapped[Essentiality] = mapped_column(Enum(Essentiality), nullable=False)
    optimization_potential: Mapped[OptimizationPotential] = mapped_column(Enum(OptimizationPotential), nullable=False)
    monthly_budget: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(80), nullable=True)
    color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    user: Mapped[User] = relationship(back_populates="categories")
    expenses: Mapped[list["Expense"]] = relationship(back_populates="category")
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_user_category_name"),)


class Expense(Base):
    __tablename__ = "expenses"
    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped[User] = relationship(back_populates="expenses")
    category: Mapped[Category] = relationship(back_populates="expenses")
    __table_args__ = (
        # Liste paginée (tri expense_date DESC, id DESC) et filtres par période : couvre aussi
        # l'ancien ix_expense_user_date (user_id, expense_date), supprimé en 0011.
        Index("ix_expense_user_date_id", "user_id", desc("expense_date"), desc("id")),
        Index("ix_expense_category_date", "category_id", "expense_date"),
    )


class SavingsGoal(Base):
    __tablename__ = "savings_goals"
    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    deadline: Mapped[date] = mapped_column(Date, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped[User] = relationship(back_populates="savings_goals")
    __table_args__ = (Index("ix_savings_goal_user", "user_id"),)
    contributions: Mapped[list["SavingsContribution"]] = relationship(
        back_populates="savings_goal", cascade="all, delete-orphan",
        order_by="SavingsContribution.created_at",
    )

    @property
    def current_amount(self) -> Decimal:
        return sum((c.amount for c in self.contributions), Decimal(0))


class SavingsContribution(Base):
    __tablename__ = "savings_contributions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    savings_goal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("savings_goals.id", ondelete="CASCADE"), nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    savings_goal: Mapped[SavingsGoal] = relationship(back_populates="contributions")
    __table_args__ = (Index("ix_contribution_goal_date", "savings_goal_id", "created_at"),)


class MonthlySnapshot(Base):
    __tablename__ = "monthly_snapshots"
    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    income: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    expenses: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    savings: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    savings_rate: Mapped[Decimal] = mapped_column(Numeric(8, 5), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "period", name="uq_snapshot_user_period"),)


class CategoryAnalytics(Base):
    __tablename__ = "category_analytics"
    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    baseline: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    trend: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False, default=0)
    volatility: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False, default=0)
    deviation: Mapped[Decimal] = mapped_column(Numeric(12, 6), nullable=False, default=0)
    frequency: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    seasonality: Mapped[Decimal | None] = mapped_column(Numeric(12, 6), nullable=True)
    confidence: Mapped[ConfidenceLevel] = mapped_column(Enum(ConfidenceLevel), nullable=False)
    trend_direction: Mapped[TrendDirection] = mapped_column(Enum(TrendDirection), nullable=False)
    drift_signal: Mapped[DriftSignal] = mapped_column(Enum(DriftSignal), nullable=False)
    current_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    estimated_saving: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    profile_data: Mapped[dict | None] = mapped_column(
        JSON().with_variant(postgresql.JSONB(), "postgresql"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "category_id", "period", name="uq_category_analytics_period"),)


class Budget(Base):
    __tablename__ = "budgets"
    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    recommended_total: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    recommended_savings: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    accepted_total: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    accepted_savings: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "period", name="uq_budget_user_period"),)


class Recommendation(Base):
    __tablename__ = "recommendations"
    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    impact_estimated: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    justification: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[RecommendationStatus] = mapped_column(Enum(RecommendationStatus), nullable=False, default=RecommendationStatus.PROPOSED)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_recommendation_user_period", "user_id", "period"),
        # Suppression en cascade d'une catégorie (FK ON DELETE CASCADE) sans parcours complet.
        Index("ix_recommendation_category", "category_id"),
    )


class AIAnalysis(Base):
    __tablename__ = "ai_analyses"
    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    model: Mapped[str] = mapped_column(String(80), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    alerts_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    recommendations_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    projected_impact_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    fallback: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("user_id", "period", name="uq_ai_analysis_user_period"),)
