"""ai_analyses.context_hash : l'analyse IA d'un mois est resservie tant que ses données
ne changent pas, au lieu de rappeler le modèle (lent et payant) à chaque visite.

Revision ID: 0016_ai_analysis_cache
Revises: 0015_deviation_precision
Create Date: 2026-11-16
"""

import sqlalchemy as sa
from alembic import op

revision = "0016_ai_analysis_cache"
down_revision = "0015_deviation_precision"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_analyses", sa.Column("context_hash", sa.String(64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("ai_analyses") as batch:
        batch.drop_column("context_hash")
