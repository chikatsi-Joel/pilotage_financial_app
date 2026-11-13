"""Index des agrégations globales (backoffice) ; le chemin chaud de l'app est déjà couvert.

Toutes les requêtes de l'app mobile filtrent d'abord par user_id, et chaque table a déjà un
index ou une contrainte unique qui commence par user_id. Seules les agrégations tous
utilisateurs du backoffice manquaient d'index.

- notification_log (created_at) : historique admin trié par date, stats et KPI sur 30 jours ;
  insertion en fin d'index (horodatage croissant), coût marginal.
- notification_log (user_id) SUPPRIMÉ : préfixe exact de uq_notification_user_key (user_id, key),
  qui sert déjà toutes les recherches par utilisateur ; un index de moins à chaque envoi.
- users (created_at) : KPI des inscriptions ; une écriture par inscription.
- expenses (expense_date) en BRIN, PostgreSQL seulement : KPI des saisies sur 30 jours sans
  user_id ; quelques Ko et coût d'écriture quasi nul sur la table la plus écrite (un B-tree serait
  payé à chaque dépense).
- user_activity_days (day, user_id) remplace (day) : count(DISTINCT user_id) en index-only scan.

En production sur de grosses tables : créer ces index en CONCURRENTLY pour ne pas bloquer les
écritures pendant leur construction (inutile aux volumes actuels).

Revision ID: 0013_indexes
Revises: 0012_backoffice
Create Date: 2026-11-13
"""

from alembic import op

revision = "0013_indexes"
down_revision = "0012_backoffice"
branch_labels = None
depends_on = None


def _postgres() -> bool:
    return op.get_bind().dialect.name == "postgresql"


def upgrade() -> None:
    op.create_index("ix_notification_log_created_at", "notification_log", ["created_at"])
    op.drop_index("ix_notification_log_user_id", table_name="notification_log")
    op.create_index("ix_users_created_at", "users", ["created_at"])
    if _postgres():
        op.create_index(
            "ix_expense_date_brin", "expenses", ["expense_date"], postgresql_using="brin"
        )
    op.create_index("ix_user_activity_day_user", "user_activity_days", ["day", "user_id"])
    op.drop_index("ix_user_activity_day", table_name="user_activity_days")


def downgrade() -> None:
    op.create_index("ix_user_activity_day", "user_activity_days", ["day"])
    op.drop_index("ix_user_activity_day_user", table_name="user_activity_days")
    if _postgres():
        op.drop_index("ix_expense_date_brin", table_name="expenses")
    op.drop_index("ix_users_created_at", table_name="users")
    op.create_index("ix_notification_log_user_id", "notification_log", ["user_id"])
    op.drop_index("ix_notification_log_created_at", table_name="notification_log")
