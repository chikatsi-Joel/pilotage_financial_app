"""category_analytics.deviation en Numeric(18,2) : écart en montant, pas un ratio.

Numeric(12,6) plafonnait l'écart à < 1 000 000 : en XAF, une catégorie à plus d'un million
d'écart faisait échouer le recalcul des analytics, et donc l'enregistrement de la dépense
(erreur 500). L'écart est un montant : même type que current_amount et baseline.

Revision ID: 0015_deviation_precision
Revises: 0014_pg_stat_statements
Create Date: 2026-11-16
"""

import sqlalchemy as sa
from alembic import op

revision = "0015_deviation_precision"
down_revision = "0014_pg_stat_statements"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("category_analytics") as batch:
        batch.alter_column(
            "deviation",
            type_=sa.Numeric(18, 2),
            existing_type=sa.Numeric(12, 6),
            existing_nullable=False,
        )


def downgrade() -> None:
    # Les écarts ≥ 1 000 000 ne tiennent pas dans l'ancien type : on les borne plutôt que
    # d'échouer (le cache est recalculé de toute façon).
    op.execute(
        "UPDATE category_analytics SET deviation = 999999.99 WHERE deviation >= 1000000"
    )
    op.execute(
        "UPDATE category_analytics SET deviation = -999999.99 WHERE deviation <= -1000000"
    )
    with op.batch_alter_table("category_analytics") as batch:
        batch.alter_column(
            "deviation",
            type_=sa.Numeric(12, 6),
            existing_type=sa.Numeric(18, 2),
            existing_nullable=False,
        )
