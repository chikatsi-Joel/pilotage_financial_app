"""ai_explanations : explication IA d'une catégorie de dépenses pour un mois.

Revision ID: 0020_ai_explanations
Revises: 0019_play_subscriptions
Create Date: 2026-11-24
"""

import sqlalchemy as sa
from alembic import op

revision = "0020_ai_explanations"
down_revision = "0019_play_subscriptions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_explanations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "category_id",
            sa.Uuid(),
            sa.ForeignKey("categories.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column("model", sa.String(80), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("points_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("context_hash", sa.String(64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("user_id", "category_id", "period", name="uq_ai_explanation_target"),
    )


def downgrade() -> None:
    op.drop_table("ai_explanations")
