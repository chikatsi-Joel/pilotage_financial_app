"""ensure ai_analyses table exists

La table avait été ajoutée à 0001_initial après coup : les bases déjà migrées
ne l'ont jamais reçue. Cette révision la crée si elle manque (idempotent).

Revision ID: 0006_ensure_ai_analyses
Revises: 0005_income_active
Create Date: 2026-11-08
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006_ensure_ai_analyses"
down_revision = "0005_income_active"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("ai_analyses"):
        return
    op.create_table(
        "ai_analyses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period", sa.String(7), nullable=False),
        sa.Column("model", sa.String(80), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("alerts_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("recommendations_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("projected_impact_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("fallback", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "period", name="uq_ai_analysis_user_period"),
    )


def downgrade() -> None:
    # Pas de suppression : la table appartient aussi à 0001_initial.
    pass
