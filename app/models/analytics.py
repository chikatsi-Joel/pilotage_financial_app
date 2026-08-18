import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import ConfidenceLevel, DriftSignal, TrendDirection


class MonthlySnapshot(Base):
    __tablename__ = "monthly_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    period: Mapped[str] = mapped_column(String(7), nullable=False)
    income: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    expenses: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    savings: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    savings_rate: Mapped[Decimal] = mapped_column(Numeric(8, 5), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (UniqueConstraint("user_id", "period", name="uq_snapshot_user_period"),)


class CategoryAnalytics(Base):
    __tablename__ = "category_analytics"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=False
    )
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
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("user_id", "category_id", "period", name="uq_category_analytics_period"),
    )
