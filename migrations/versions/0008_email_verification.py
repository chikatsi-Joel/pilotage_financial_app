"""email verification columns on users

Revision ID: 0008_email_verification
Revises: 0007_auth
Create Date: 2026-11-09
"""
import sqlalchemy as sa
from alembic import op

revision = "0008_email_verification"
down_revision = "0007_auth"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("email_code_hash", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("email_code_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("email_code_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "users",
        sa.Column("email_code_attempts", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    for column in (
        "email_code_attempts",
        "email_code_sent_at",
        "email_code_expires_at",
        "email_code_hash",
        "email_verified_at",
    ):
        op.drop_column("users", column)
