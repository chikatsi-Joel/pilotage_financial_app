"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-08-17
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_table(
        "categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("category_type", sa.Enum("EXPENSE", name="categorytype"), nullable=False),
        sa.Column(
            "essentiality",
            sa.Enum("ESSENTIAL", "NON_ESSENTIAL", name="essentiality"),
            nullable=False,
        ),
        sa.Column(
            "optimization_potential",
            sa.Enum("LOW", "MEDIUM", "HIGH", name="optimizationpotential"),
            nullable=False,
        ),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("user_id", "name", name="uq_user_category_name"),
    )
    op.create_table(
        "incomes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("income_date", sa.Date(), nullable=False),
        sa.Column("source", sa.String(160), nullable=False),
        sa.Column("recurring", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_income_user_date", "incomes", ["user_id", "income_date"])
    op.create_table(
        "expenses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("categories.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("note", sa.Text()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_expense_user_date", "expenses", ["user_id", "expense_date"])
    op.create_index("ix_expense_category_date", "expenses", ["category_id", "expense_date"])
    op.create_table(
        "savings_goals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("target_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("deadline", sa.Date(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_table(
        "savings_contributions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "savings_goal_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("savings_goals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(18, 2), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_contribution_goal_date", "savings_contributions", ["savings_goal_id", "created_at"]
    )
    op.create_table(
        "monthly_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column("income", sa.Numeric(18, 2), nullable=False),
        sa.Column("expenses", sa.Numeric(18, 2), nullable=False),
        sa.Column("savings", sa.Numeric(18, 2), nullable=False),
        sa.Column("savings_rate", sa.Numeric(8, 5), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("user_id", "period", name="uq_snapshot_user_period"),
    )
    op.create_table(
        "category_analytics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("categories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column("baseline", sa.Numeric(18, 2)),
        sa.Column("trend", sa.Numeric(12, 6), nullable=False),
        sa.Column("volatility", sa.Numeric(12, 6), nullable=False),
        sa.Column("deviation", sa.Numeric(12, 6), nullable=False),
        sa.Column("frequency", sa.Integer(), nullable=False),
        sa.Column("seasonality", sa.Numeric(12, 6)),
        sa.Column(
            "confidence", sa.Enum("LOW", "MEDIUM", "HIGH", name="confidencelevel"), nullable=False
        ),
        sa.Column(
            "trend_direction",
            sa.Enum("DECREASING", "STABLE", "INCREASING", name="trenddirection"),
            nullable=False,
        ),
        sa.Column(
            "drift_signal",
            sa.Enum("NORMAL", "ATTENTION", "STRONG_DRIFT", name="driftsignal"),
            nullable=False,
        ),
        sa.Column("current_amount", sa.Numeric(18, 2), nullable=False),
        sa.Column("estimated_saving", sa.Numeric(18, 2), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint(
            "user_id", "category_id", "period", name="uq_category_analytics_period"
        ),
    )
    op.create_table(
        "budgets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column("recommended_total", sa.Numeric(18, 2), nullable=False),
        sa.Column("recommended_savings", sa.Numeric(18, 2), nullable=False),
        sa.Column("accepted_total", sa.Numeric(18, 2)),
        sa.Column("accepted_savings", sa.Numeric(18, 2)),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("user_id", "period", name="uq_budget_user_period"),
    )
    op.create_table(
        "recommendations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("categories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("impact_estimated", sa.Numeric(18, 2), nullable=False),
        sa.Column("justification", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("PROPOSED", "ACCEPTED", "REJECTED", "ADJUSTED", name="recommendationstatus"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_table(
        "ai_analyses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column("model", sa.String(80), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("alerts_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("recommendations_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("projected_impact_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("fallback", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("user_id", "period", name="uq_ai_analysis_user_period"),
    )


def downgrade() -> None:
    op.drop_table("ai_analyses")
    op.drop_table("recommendations")
    op.drop_table("budgets")
    op.drop_table("category_analytics")
    op.drop_table("monthly_snapshots")
    op.drop_table("savings_goals")
    op.drop_index("ix_expense_category_date", table_name="expenses")
    op.drop_index("ix_expense_user_date", table_name="expenses")
    op.drop_table("expenses")
    op.drop_index("ix_income_user_date", table_name="incomes")
    op.drop_table("incomes")
    op.drop_table("categories")
    op.drop_table("users")
    for enum_name in [
        "recommendationstatus",
        "driftsignal",
        "trenddirection",
        "confidencelevel",
        "optimizationpotential",
        "essentiality",
        "categorytype",
    ]:
        sa.Enum(name=enum_name).drop(op.get_bind(), checkfirst=True)
