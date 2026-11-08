"""Création de dépenses en lot : tout ou rien."""

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.base import Base
from app.models import Category, Essentiality, Expense, OptimizationPotential, User
from app.schemas.common import ExpenseBulkCreate, ExpenseCreate
from app.services import expense_service
from app.services.errors import NotFound


@pytest.fixture
async def session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(engine, expire_on_commit=False)() as db:
        yield db
    await engine.dispose()


async def _user_with_category(db: AsyncSession) -> tuple[User, Category]:
    user = User(name="Bulk", currency="XAF")
    db.add(user)
    await db.flush()
    cat = Category(
        user_id=user.id,
        name="Food",
        essentiality=Essentiality.ESSENTIAL,
        optimization_potential=OptimizationPotential.LOW,
    )
    db.add(cat)
    await db.commit()
    return user, cat


async def _count(db: AsyncSession) -> int:
    return (await db.execute(select(func.count()).select_from(Expense))).scalar_one()


async def test_create_many_persists_all_lines(session: AsyncSession) -> None:
    user, cat = await _user_with_category(session)
    payloads = [
        ExpenseCreate(amount=Decimal("1.50"), category_id=cat.id, expense_date=date(2026, 3, 5), note="Lait"),
        ExpenseCreate(amount=Decimal("2.50"), category_id=cat.id, expense_date=date(2026, 3, 5), note="Pain"),
    ]

    created = await expense_service.create_many(user.id, payloads, session)

    assert [e.note for e in created] == ["Lait", "Pain"]
    assert await _count(session) == 2


async def test_create_many_is_all_or_nothing(session: AsyncSession) -> None:
    user, cat = await _user_with_category(session)
    payloads = [
        ExpenseCreate(amount=Decimal("1"), category_id=cat.id, expense_date=date(2026, 3, 5)),
        ExpenseCreate(amount=Decimal("2"), category_id=uuid4(), expense_date=date(2026, 3, 5)),
    ]

    with pytest.raises(NotFound):
        await expense_service.create_many(user.id, payloads, session)

    assert await _count(session) == 0


def test_bulk_schema_rejects_empty_list() -> None:
    with pytest.raises(ValueError):
        ExpenseBulkCreate(items=[])
