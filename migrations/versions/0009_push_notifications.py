"""push notifications: devices, preferences, sent log

Revision ID: 0009_push_notifications
Revises: 0008_email_verification
Create Date: 2026-11-09
"""
import sqlalchemy as sa
from alembic import op

revision = "0009_push_notifications"
down_revision = "0008_email_verification"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_devices",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.Uuid(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token", sa.String(255), nullable=False),
        sa.Column("platform", sa.String(16), nullable=False, server_default="unknown"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_push_devices_user_id", "push_devices", ["user_id"])
    op.create_index("ix_push_devices_token", "push_devices", ["token"], unique=True)

    op.create_table(
        "notification_preferences",
        sa.Column("user_id", sa.Uuid(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("budget_alerts", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("savings_milestones", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("daily_reminder", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("daily_reminder_hour", sa.Integer(), nullable=False, server_default="20"),
        sa.Column("weekly_summary", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("ai_insights", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("timezone", sa.String(64), nullable=False, server_default="UTC"),
    )

    op.create_table(
        "notification_log",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True),
        sa.Column("user_id", sa.Uuid(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("key", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "key", name="uq_notification_user_key"),
    )
    op.create_index("ix_notification_log_user_id", "notification_log", ["user_id"])


def downgrade() -> None:
    op.drop_table("notification_log")
    op.drop_table("notification_preferences")
    op.drop_table("push_devices")
