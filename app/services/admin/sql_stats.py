"""Onglet « Requêtes SQL » : statistiques de pg_stat_statements pour la base de l'app.

Les textes de requête sont normalisés par PostgreSQL (valeurs remplacées par $1, $2…) : aucune
donnée utilisateur n'est exposée. Seules les requêtes de la base courante sont listées.
"""

from __future__ import annotations

from typing import Any, Literal

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.errors import ServiceError

SortKey = Literal["total", "mean", "calls", "rows", "max"]
QUERY_MAX_CHARS = 4000

# Commentaire placé dans les requêtes de cet onglet : pg_stat_statements le conserve, ce qui
# permet de les exclure des résultats (l'onglet ne se mesure pas lui-même).
MARK = "/* lucia-admin-sql-stats */"

_ORDER = {
    "total": "s.total_exec_time",
    "mean": "s.mean_exec_time",
    "calls": "s.calls",
    "rows": "s.rows",
    "max": "s.max_exec_time",
}


class SqlStatsUnavailable(ServiceError):
    status_code = 409


async def _availability(db: AsyncSession) -> str | None:
    """None si les statistiques sont lisibles, sinon la raison à afficher."""
    if db.get_bind().dialect.name != "postgresql":
        return "Statistiques SQL disponibles uniquement avec PostgreSQL"
    installed, preload = (
        await db.execute(
            text(
                f"{MARK} SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'), "
                "current_setting('shared_preload_libraries')"
            )
        )
    ).one()
    if not installed:
        return "Extension pg_stat_statements absente : lancez les migrations (alembic upgrade head)"
    if "pg_stat_statements" not in preload:
        return (
            "PostgreSQL doit précharger pg_stat_statements "
            "(shared_preload_libraries, voir docker-compose.yml) puis redémarrer"
        )
    return None


async def overview(db: AsyncSession, sort: SortKey, limit: int) -> dict[str, Any]:
    reason = await _availability(db)
    if reason:
        return {"available": False, "reason": reason}

    where = (
        "s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database()) "
        "AND s.query NOT LIKE '%lucia-admin-sql-stats%'"
    )
    totals = (
        await db.execute(
            text(
                f"""{MARK}
                SELECT count(*) AS statements,
                       coalesce(sum(s.calls), 0) AS calls,
                       coalesce(sum(s.total_exec_time), 0) AS total_ms,
                       coalesce(sum(s.shared_blks_hit), 0) AS hit,
                       coalesce(sum(s.shared_blks_read), 0) AS read
                FROM pg_stat_statements s WHERE {where}
                """
            )
        )
    ).one()
    rows = (
        await db.execute(
            text(
                f"""{MARK}
                SELECT s.queryid::text AS id, left(s.query, :max_chars) AS query, s.calls,
                       s.total_exec_time AS total_ms, s.mean_exec_time AS mean_ms,
                       s.max_exec_time AS max_ms, s.stddev_exec_time AS stddev_ms, s.rows,
                       s.shared_blks_hit AS hit, s.shared_blks_read AS read
                FROM pg_stat_statements s
                WHERE {where}
                ORDER BY {_ORDER[sort]} DESC
                LIMIT :limit
                """
            ),
            {"limit": limit, "max_chars": QUERY_MAX_CHARS},
        )
    ).all()
    try:
        reset_at = (await db.execute(text(f"{MARK} SELECT stats_reset FROM pg_stat_statements_info"))).scalar()
    except DBAPIError:  # PostgreSQL 13 : vue pg_stat_statements_info absente (< 13 non pris en charge)
        await db.rollback()
        reset_at = None

    def ratio(hit: int, read: int) -> float | None:
        return round(hit / (hit + read), 4) if hit + read else None

    total_ms = float(totals.total_ms)
    return {
        "available": True,
        "since": reset_at,
        "statements": int(totals.statements),
        "calls": int(totals.calls),
        "total_ms": round(total_ms, 1),
        "cache_hit_ratio": ratio(int(totals.hit), int(totals.read)),
        "queries": [
            {
                "id": r.id,
                "query": r.query,
                "calls": int(r.calls),
                "total_ms": round(float(r.total_ms), 2),
                "mean_ms": round(float(r.mean_ms), 3),
                "max_ms": round(float(r.max_ms), 2),
                "stddev_ms": round(float(r.stddev_ms), 3),
                "rows": int(r.rows),
                "share": round(float(r.total_ms) / total_ms, 4) if total_ms else 0,
                "cache_hit_ratio": ratio(int(r.hit), int(r.read)),
            }
            for r in rows
        ],
    }


async def reset(db: AsyncSession) -> None:
    """Remet les compteurs à zéro (pour mesurer après une optimisation)."""
    reason = await _availability(db)
    if reason:
        raise SqlStatsUnavailable(reason)
    # Uniquement la base de l'app (pas les autres bases du même serveur).
    try:
        await db.execute(
            text(
                f"{MARK} SELECT pg_stat_statements_reset(0, "
                "(SELECT oid FROM pg_database WHERE datname = current_database()), 0)"
            )
        )
    except DBAPIError as exc:
        await db.rollback()
        if getattr(exc.orig, "sqlstate", None) != "42501":  # insufficient_privilege
            raise
        raise SqlStatsUnavailable(
            "Droit insuffisant pour remettre à zéro : exécuter en superuser "
            "GRANT EXECUTE ON FUNCTION pg_stat_statements_reset(oid, oid, bigint) TO <rôle de l'app>"
        ) from exc
    await db.commit()
