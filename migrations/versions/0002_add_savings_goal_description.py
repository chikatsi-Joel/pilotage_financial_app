"""add savings goal description

Revision ID: 0002_goal_description
Revises: 0001_initial
Create Date: 2026-08-18
"""

import sqlalchemy as sa
from alembic import op

revision = "0002_goal_description"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("savings_goals", sa.Column("description", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("savings_goals", "description")
