"""INSERT … ON CONFLICT DO UPDATE en une seule requête, pour PostgreSQL et SQLite (tests)."""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import Base

_INSERTS = {"postgresql": postgresql.insert, "sqlite": sqlite.insert}


async def upsert(
    db: AsyncSession,
    model: type[Base],
    rows: Sequence[Mapping[str, Any]],
    conflict_columns: Iterable[str],
    update_columns: Iterable[str],
) -> None:
    """Insère `rows` ; sur conflit de `conflict_columns`, met à jour `update_columns`.

    Remplace la boucle « SELECT puis INSERT ou UPDATE » ligne par ligne : un seul aller-retour,
    et aucune IntegrityError si deux transactions écrivent la même clé (la seconde met à jour).
    Les objets ORM déjà chargés pour ces lignes ne sont pas rafraîchis : relire avec
    `populate_existing` si besoin.
    """
    if not rows:
        return
    dialect = db.get_bind().dialect.name
    insert = _INSERTS.get(dialect)
    if insert is None:
        raise NotImplementedError(f"upsert non pris en charge pour le dialecte {dialect!r}")
    stmt = insert(model).values(list(rows))
    stmt = stmt.on_conflict_do_update(
        index_elements=list(conflict_columns),
        set_={column: stmt.excluded[column] for column in update_columns},
    )
    await db.execute(stmt)


async def insert_ignore(
    db: AsyncSession,
    model: type[Base],
    rows: Sequence[Mapping[str, Any]],
    conflict_columns: Iterable[str],
) -> None:
    """INSERT … ON CONFLICT DO NOTHING : ajoute les lignes absentes, ignore les autres."""
    if not rows:
        return
    insert = _INSERTS.get(db.get_bind().dialect.name)
    if insert is None:
        raise NotImplementedError("insert_ignore non pris en charge pour ce dialecte")
    stmt = insert(model).values(list(rows)).on_conflict_do_nothing(
        index_elements=list(conflict_columns)
    )
    await db.execute(stmt)
