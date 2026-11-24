"""play_subscriptions : abonnements Premium achetés sur Google Play et vérifiés par le backend.

Revision ID: 0019_play_subscriptions
Revises: 0018_ai_usage_dedup
Create Date: 2026-11-23
"""

import sqlalchemy as sa
from alembic import op

revision = "0019_play_subscriptions"
down_revision = "0018_ai_usage_dedup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "play_subscriptions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("product_id", sa.String(100), nullable=False),
        sa.Column("base_plan_id", sa.String(100), nullable=True),
        sa.Column("purchase_token", sa.Text(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("state", sa.String(60), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("auto_renewing", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("test_purchase", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_play_subscriptions_user_id", "play_subscriptions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_play_subscriptions_user_id", table_name="play_subscriptions")
    op.drop_table("play_subscriptions")
