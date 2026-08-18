import importlib

from alembic.migration import MigrationContext
from alembic.operations import Operations
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


def test_alembic_migration_0001_initial():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        ctx = MigrationContext.configure(conn)
        with Operations.context(ctx):
            migration_module = importlib.import_module("migrations.versions.0001_initial")
            migration_module.upgrade()

    tables = set(inspect(engine).get_table_names())
    assert {
        "users", "incomes", "categories", "expenses", "savings_goals",
        "monthly_snapshots", "category_analytics", "budgets", "recommendations",
        "ai_analyses",
    } <= tables
