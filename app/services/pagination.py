from __future__ import annotations

import base64
import json
from typing import Any

from sqlalchemy import Select
from sqlalchemy.ext.asyncio import AsyncSession


def _encode_cursor(data: dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(
        json.dumps(data, default=str).encode()
    ).decode()


def _decode_cursor(cursor: str) -> dict[str, Any]:
    return json.loads(
        base64.urlsafe_b64decode(cursor.encode()).decode()
    )


async def paginate(
    db: AsyncSession,
    query: Select,
    limit: int,
    cursor: str | None = None,
    *,
    id_col: Any,
    sort_col: Any,
    sort_desc: bool = True,
) -> tuple[list, str | None, bool]:
    """Execute a cursor-paginated query.

    Returns (items, next_cursor, has_more).
    """
    if cursor:
        cursor_data = _decode_cursor(cursor)
        cursor_id = cursor_data["id"]
        cursor_sort = cursor_data["s"]

        if sort_desc:
            query = query.where(
                (sort_col < cursor_sort)
                | ((sort_col == cursor_sort) & (id_col < cursor_id))
            )
        else:
            query = query.where(
                (sort_col > cursor_sort)
                | ((sort_col == cursor_sort) & (id_col > cursor_id))
            )

    sort_order = sort_col.desc() if sort_desc else sort_col.asc()
    id_order = id_col.desc() if sort_desc else id_col.asc()
    query = query.order_by(sort_order, id_order)
    query = query.limit(limit + 1)

    result = await db.execute(query)
    rows = list(result.scalars().all())

    has_more = len(rows) > limit
    items = rows[:limit]

    next_cursor = None
    if has_more and items:
        last = items[-1]
        next_cursor = _encode_cursor(
            {"id": str(last.id), "s": str(getattr(last, sort_col.key))}
        )

    return items, next_cursor, has_more
