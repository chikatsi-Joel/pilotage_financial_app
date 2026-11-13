"""Extension pg_stat_statements : statistiques des requêtes SQL pour le backoffice.

La bibliothèque doit aussi être préchargée par le serveur PostgreSQL
(`shared_preload_libraries=pg_stat_statements`, voir docker-compose.yml) ; sans cela
l'extension existe mais sa vue reste vide et le backoffice l'indique.

L'extension n'est pas « trusted » : il faut un superuser pour la créer. Si le rôle de
l'app n'a pas ce droit (ou si le module manque), la migration ne fait rien plutôt que
d'empêcher l'API de démarrer : l'onglet affiche alors « extension absente ».

Revision ID: 0014_pg_stat_statements
Revises: 0013_indexes
Create Date: 2026-11-13
"""

from alembic import op

revision = "0014_pg_stat_statements"
down_revision = "0013_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS pg_stat_statements; "
            "EXCEPTION WHEN insufficient_privilege OR undefined_file OR feature_not_supported THEN "
            "RAISE NOTICE 'pg_stat_statements non installé (droits ou module manquants)'; END $$"
        )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute(
            "DO $$ BEGIN DROP EXTENSION IF EXISTS pg_stat_statements; "
            "EXCEPTION WHEN insufficient_privilege OR dependent_objects_still_exist THEN "
            "RAISE NOTICE 'pg_stat_statements conservé'; END $$"
        )
