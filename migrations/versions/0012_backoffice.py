"""Backoffice : comptes admin, sessions admin, configuration générale, jours d'activité.

Revision ID: 0012_backoffice
Revises: 0011_query_indexes
Create Date: 2026-11-13
"""

import sqlalchemy as sa
from alembic import op

revision = "0012_backoffice"
down_revision = "0011_query_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_activity_days",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("day", sa.Date(), primary_key=True),
    )
    op.create_index("ix_user_activity_day", "user_activity_days", ["day"])
    # Amorçage : dernier jour d'utilisation connu de chaque session existante.
    op.execute(
        "INSERT INTO user_activity_days (user_id, day) "
        "SELECT DISTINCT user_id, CAST(last_used_at AT TIME ZONE 'UTC' AS DATE) FROM auth_sessions"
    )

    op.create_table(
        "admin_users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "admin_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("admin_id", sa.Uuid(), sa.ForeignKey("admin_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_admin_sessions_admin_id", "admin_sessions", ["admin_id"])
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(80), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("is_secret", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_by", sa.String(254), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
    op.drop_index("ix_admin_sessions_admin_id", table_name="admin_sessions")
    op.drop_table("admin_sessions")
    op.drop_table("admin_users")
    op.drop_index("ix_user_activity_day", table_name="user_activity_days")
    op.drop_table("user_activity_days")
