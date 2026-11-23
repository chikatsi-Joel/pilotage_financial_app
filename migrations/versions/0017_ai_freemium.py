"""Freemium de l'analyse IA : users.premium_until et table ai_usage (appels comptés).

Revision ID: 0017_ai_freemium
Revises: 0016_ai_analysis_cache
Create Date: 2026-11-17
"""

import sqlalchemy as sa
from alembic import op

revision = "0017_ai_freemium"
down_revision = "0016_ai_analysis_cache"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("premium_until", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "ai_usage",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_ai_usage_user_created", "ai_usage", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_usage_user_created", table_name="ai_usage")
    op.drop_table("ai_usage")
    with op.batch_alter_table("users") as batch:
        batch.drop_column("premium_until")
