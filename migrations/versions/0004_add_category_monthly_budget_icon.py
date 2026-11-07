"""add monthly_budget, icon and color to categories

Revision ID: 0004_category_monthly_budget
Revises: 0003_category_analytics_profile
Create Date: 2026-10-04
"""
import sqlalchemy as sa
from alembic import op

revision = "0004_category_monthly_budget"
down_revision = "0003_category_analytics_profile"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("categories", sa.Column("monthly_budget", sa.Numeric(18, 2), nullable=True))
    op.add_column("categories", sa.Column("icon", sa.String(80), nullable=True))
    op.add_column("categories", sa.Column("color", sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_column("categories", "color")
    op.drop_column("categories", "icon")
    op.drop_column("categories", "monthly_budget")