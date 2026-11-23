"""ai_usage.period et ai_usage.context_hash : une même analyse demandée deux fois en même
temps (deux écrans) n'est comptée qu'une fois dans le quota freemium.

Migration séparée de 0017, déjà appliquée sur certaines bases sans ces colonnes.

Revision ID: 0018_ai_usage_dedup
Revises: 0017_ai_freemium
Create Date: 2026-11-17
"""

import sqlalchemy as sa
from alembic import op

revision = "0018_ai_usage_dedup"
down_revision = "0017_ai_freemium"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_usage", sa.Column("period", sa.String(7), nullable=True))
    op.add_column("ai_usage", sa.Column("context_hash", sa.String(64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("ai_usage") as batch:
        batch.drop_column("context_hash")
        batch.drop_column("period")
