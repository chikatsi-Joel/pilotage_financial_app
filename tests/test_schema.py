from sqlalchemy import create_engine, inspect

from app.db.base import Base
from app.models import *  # noqa: F401,F403


def test_all_tables_build_on_sqlite_metadata():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    tables = set(inspect(engine).get_table_names())
    assert {
        "users", "incomes", "categories", "expenses", "savings_goals",
        "monthly_snapshots", "category_analytics", "budgets", "recommendations",
        "ai_analyses",
    } <= tables
