"""add profile_data to category_analytics

Revision ID: 0003_add_category_analytics_profile_data
Revises: 0002_add_savings_goal_description
Create Date: 2026-08-25
"""
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003_add_category_analytics_profile_data"
down_revision = "0002_add_savings_goal_description"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "category_analytics",
        postgresql.JSONB().with_variant(
            postgresql.JSONB(), "postgresql"
        ).name("profile_data"),
    )


def downgrade() -> None:
    op.drop_column("category_analytics", "profile_data")
