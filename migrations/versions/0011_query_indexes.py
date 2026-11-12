"""Index pour les requêtes fréquentes (recommandations, dépenses paginées, objectifs).

- recommendations (user_id, period) : liste et remplacement des recommandations d'un mois ;
- recommendations (category_id) : suppression en cascade d'une catégorie ;
- savings_goals (user_id) : objectifs d'un utilisateur (dashboard, budget, notifications) ;
- expenses (user_id, expense_date DESC, id DESC) : pagination par curseur (même ordre que
  l'index) et filtres par période ; remplace ix_expense_user_date (user_id, expense_date),
  dont il couvre toutes les recherches (préfixe identique, parcours possible dans les deux sens).

Revision ID: 0011_query_indexes
Revises: 0010_firebase_uid
Create Date: 2026-11-12
"""

import sqlalchemy as sa
from alembic import op

revision = "0011_query_indexes"
down_revision = "0010_firebase_uid"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_recommendation_user_period", "recommendations", ["user_id", "period"])
    op.create_index("ix_recommendation_category", "recommendations", ["category_id"])
    op.create_index("ix_savings_goal_user", "savings_goals", ["user_id"])
    op.create_index(
        "ix_expense_user_date_id",
        "expenses",
        ["user_id", sa.text("expense_date DESC"), sa.text("id DESC")],
    )
    op.drop_index("ix_expense_user_date", table_name="expenses")


def downgrade() -> None:
    op.create_index("ix_expense_user_date", "expenses", ["user_id", "expense_date"])
    op.drop_index("ix_expense_user_date_id", table_name="expenses")
    op.drop_index("ix_savings_goal_user", table_name="savings_goals")
    op.drop_index("ix_recommendation_category", table_name="recommendations")
    op.drop_index("ix_recommendation_user_period", table_name="recommendations")
