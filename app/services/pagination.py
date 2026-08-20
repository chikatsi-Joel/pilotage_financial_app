from __future__ import annotations

import base64
import json
from typing import Any, TypeVar

from sqlalchemy import Select
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")

_CURSOR_ID_KEY = "id"
_CURSOR_SORT_KEY = "s"


def _encode_cursor(data: dict[str, Any]) -> str:
    """Encode a cursor payload as a URL-safe base64 string."""
    return base64.urlsafe_b64encode(json.dumps(data, default=str).encode()).decode()


def _decode_cursor(cursor: str) -> dict[str, Any]:
    """Decode a cursor previously produced by `_encode_cursor`."""
    return json.loads(base64.urlsafe_b64decode(cursor.encode()).decode())


async def paginate(
    db: AsyncSession,
    query: Select[tuple[T]],
    limit: int,
    cursor: str | None = None,
    *,
    id_col: Any,
    sort_col: Any,
    sort_desc: bool = True,
) -> tuple[list[T], str | None, bool]:
    """Execute a keyset (cursor) paginated query.

    Uses a compound (sort_col, id_col) comparison so pagination stays stable
    even when several rows share the same sort_col value.

    Args:
        db: Active async session used to run the query.
        query: Base Select statement, without ORDER BY / LIMIT applied.
        limit: Maximum number of items to return in this page.
        cursor: Opaque cursor from a previous call's next_cursor, or None
            for the first page.
        id_col: Tie-breaker column (typically the primary key), guaranteeing
            a unique, deterministic ordering.
        sort_col: Column the results are primarily ordered by.
        sort_desc: Sort direction; True for descending, False for ascending.

    Returns:
        A (items, next_cursor, has_more) tuple. next_cursor is None when
        there is no further page.
    """
    if cursor:
        cursor_data = _decode_cursor(cursor)
        cursor_id = cursor_data[_CURSOR_ID_KEY]
        cursor_sort = cursor_data[_CURSOR_SORT_KEY]

        if sort_desc:
            query = query.where(
                (sort_col < cursor_sort) | ((sort_col == cursor_sort) & (id_col < cursor_id))
            )
        else:
            query = query.where(
                (sort_col > cursor_sort) | ((sort_col == cursor_sort) & (id_col > cursor_id))
            )

    sort_order = sort_col.desc() if sort_desc else sort_col.asc()
    id_order = id_col.desc() if sort_desc else id_col.asc()
    query = query.order_by(sort_order, id_order).limit(limit + 1)

    result = await db.execute(query)
    rows = list(result.scalars().all())

    has_more = len(rows) > limit
    items = rows[:limit]

    next_cursor = None
    if has_more and items:
        last = items[-1]
        next_cursor = _encode_cursor(
            {
                _CURSOR_ID_KEY: str(last.id), _CURSOR_SORT_KEY: str(getattr(last, sort_col.key)),
            }
        )

    return items, next_cursor, has_more