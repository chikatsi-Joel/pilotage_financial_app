"""add active to incomes

Revision ID: 0005_income_active
Revises: 0004_category_monthly_budget
Create Date: 2026-10-04
"""
import sqlalchemy as sa
from alembic import op

revision = "0005_income_active"
down_revision = "0004_category_monthly_budget"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("incomes", sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")))


def downgrade() -> None:
    op.drop_column("incomes", "active")