"""add profile_data to category_analytics

Revision ID: 0003_category_analytics_profile
Revises: 0002_goal_description
Create Date: 2026-08-25
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003_category_analytics_profile"
down_revision = "0002_goal_description"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "category_analytics",
        sa.Column("profile_data", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("category_analytics", "profile_data")
