"""Pagination des depenses : tri par date, recherche cote serveur, curseur typé."""

import base64
import json
from datetime import date, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from app.models import Expense
from app.services import expense_service
from app.services.pagination import _coerce_sort_value, _encode_cursor


class _Result:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)


class _CapturingDb:
    """Enregistre la requete SQL au lieu de l'executer."""

    def __init__(self, rows=()):
        self.rows = rows
        self.statement = None

    async def execute(self, statement):
        self.statement = statement
        return _Result(self.rows)

    def sql(self) -> str:
        return str(
            self.statement.compile(
                dialect=postgresql.dialect(), compile_kwargs={"literal_binds": False}
            )
        )


def test_cursor_value_is_converted_back_to_a_date():
    assert _coerce_sort_value(Expense.expense_date, "2026-03-04") == date(2026, 3, 4)


def test_cursor_value_is_converted_back_to_a_datetime():
    value = _coerce_sort_value(Expense.created_at, "2026-03-04 10:11:12+00:00")
    assert isinstance(value, datetime)
    assert value.year == 2026 and value.hour == 10


def test_like_pattern_escapes_wildcards():
    assert expense_service._like_pattern("50%_a") == "%50\\%\\_a%"
    assert expense_service._like_pattern("a\\b") == "%a\\\\b%"


@pytest.mark.asyncio
async def test_list_is_ordered_by_expense_date_then_id():
    db = _CapturingDb()
    await expense_service.list_by_user(uuid4(), db, limit=30)
    sql = db.sql()
    assert "ORDER BY expenses.expense_date DESC, expenses.id DESC" in sql
    assert "LIMIT" in sql
    assert "JOIN categories" not in sql  # pas de jointure sans recherche


@pytest.mark.asyncio
async def test_search_matches_note_or_category_name():
    db = _CapturingDb()
    await expense_service.list_by_user(uuid4(), db, search="  café ", limit=30)
    sql = db.sql()
    assert "JOIN categories" in sql
    assert sql.count("ILIKE") == 2
    assert " OR " in sql


@pytest.mark.asyncio
async def test_blank_search_is_ignored():
    db = _CapturingDb()
    await expense_service.list_by_user(uuid4(), db, search="   ", limit=30)
    assert "ILIKE" not in db.sql()


@pytest.mark.asyncio
async def test_next_cursor_continues_after_the_last_item():
    rows = [
        SimpleNamespace(id=uuid4(), expense_date=date(2026, 3, 10 - i))
        for i in range(3)
    ]
    db = _CapturingDb(rows)
    items, next_cursor, has_more = await expense_service.list_by_user(
        uuid4(), db, limit=2
    )
    assert has_more and len(items) == 2
    payload = json.loads(base64.urlsafe_b64decode(next_cursor.encode()))
    assert payload["s"] == "2026-03-09"  # date du dernier element renvoye

    # Page suivante : le curseur est decode en vraie date dans la requete.
    db2 = _CapturingDb()
    await expense_service.list_by_user(uuid4(), db2, cursor=next_cursor, limit=2)
    params = db2.statement.compile(dialect=postgresql.dialect()).params
    assert date(2026, 3, 9) in params.values()


def test_encode_cursor_is_url_safe():
    token = _encode_cursor({"id": "x", "s": "2026-01-01"})
    assert "+" not in token and "/" not in token


@pytest.mark.asyncio
async def test_daily_totals_are_aggregated_by_the_database():
    from decimal import Decimal

    db = _CapturingDb([(date(2026, 3, 1), Decimal("12.50")), (date(2026, 3, 4), Decimal("3"))])
    rows = await expense_service.daily_totals(
        uuid4(), db, date(2026, 3, 1), date(2026, 3, 31), uuid4()
    )
    assert rows == [(date(2026, 3, 1), 12.5), (date(2026, 3, 4), 3.0)]
    sql = db.sql()
    assert "sum(expenses.amount)" in sql
    assert "GROUP BY expenses.expense_date" in sql
    assert "expenses.category_id" in sql
