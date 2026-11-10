from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Category, Expense
from app.schemas.common import ExpenseCreate
from app.services.analytics_service import invalidate_snapshots
from app.services.errors import NotFound
from app.services.periods import period_of
from app.services.pagination import paginate


async def create(user_id: UUID, payload: ExpenseCreate, db: AsyncSession) -> Expense:
    category = await db.get(Category, payload.category_id)
    if not category or category.user_id != user_id:
        raise NotFound("Category not found")

    expense = Expense(user_id=user_id, **payload.model_dump())
    db.add(expense)
    await db.flush()

    period = period_of(expense.expense_date)
    await invalidate_snapshots(user_id, period, db)
    await db.commit()
    await db.refresh(expense)
    return expense


async def create_many(
    user_id: UUID, payloads: list[ExpenseCreate], db: AsyncSession
) -> list[Expense]:
    """Crée toutes les dépenses ou aucune : une seule transaction."""
    category_ids = {p.category_id for p in payloads}
    found = (
        await db.execute(
            select(Category.id).where(
                Category.user_id == user_id, Category.id.in_(category_ids)
            )
        )
    ).scalars().all()
    if len(set(found)) != len(category_ids):
        raise NotFound("Category not found")

    expenses = [Expense(user_id=user_id, **p.model_dump()) for p in payloads]
    db.add_all(expenses)
    await db.flush()

    for period in {period_of(e.expense_date) for e in expenses}:
        await invalidate_snapshots(user_id, period, db)
    await db.commit()
    for expense in expenses:
        await db.refresh(expense)
    return expenses


def _like_pattern(text: str) -> str:
    """Pattern ILIKE 'contient', avec %, _ et \\ saisis par l'utilisateur echappes."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


async def list_by_user(
    user_id: UUID, db: AsyncSession, from_date: date | None = None,
    to_date: date | None = None, category_id: UUID | None = None,
    *, search: str | None = None, cursor: str | None = None, limit: int = 20,
) -> tuple[list[Expense], str | None, bool]:
    """Depenses de l'utilisateur, de la plus recente a la plus ancienne (par date).

    `search` filtre sur la note ou le nom de la categorie (insensible a la casse).
    """
    query = select(Expense).where(Expense.user_id == user_id)
    term = (search or "").strip()
    if term:
        pattern = _like_pattern(term)
        query = query.join(Category, Category.id == Expense.category_id).where(
            or_(
                Expense.note.ilike(pattern, escape="\\"),
                Category.name.ilike(pattern, escape="\\"),
            )
        )
    if from_date:
        query = query.where(Expense.expense_date >= from_date)
    if to_date:
        query = query.where(Expense.expense_date <= to_date)
    if category_id:
        query = query.where(Expense.category_id == category_id)

    return await paginate(
        db, query, limit, cursor,
        id_col=Expense.id, sort_col=Expense.expense_date, sort_desc=True,
    )


async def daily_totals(
    user_id: UUID, db: AsyncSession, from_date: date, to_date: date,
    category_id: UUID | None = None,
) -> list[tuple[date, float]]:
    """Total des depenses par jour (agrege par la base) sur [from_date, to_date]."""
    query = (
        select(Expense.expense_date, func.sum(Expense.amount))
        .where(
            Expense.user_id == user_id,
            Expense.expense_date >= from_date,
            Expense.expense_date <= to_date,
        )
        .group_by(Expense.expense_date)
        .order_by(Expense.expense_date)
    )
    if category_id:
        query = query.where(Expense.category_id == category_id)
    rows = (await db.execute(query)).all()
    return [(day, float(total)) for day, total in rows]


async def update(
    user_id: UUID, expense_id: UUID, payload: ExpenseCreate, db: AsyncSession
) -> Expense:
    result = await db.execute(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.user_id == user_id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise NotFound("Expense not found")

    category = await db.get(Category, payload.category_id)
    if not category or category.user_id != user_id:
        raise NotFound("Category not found")

    old_period = period_of(expense.expense_date)

    for key, value in payload.model_dump().items():
        setattr(expense, key, value)
    await db.flush()

    new_period = period_of(expense.expense_date)
    await invalidate_snapshots(user_id, old_period, db)
    if new_period != old_period:
        await invalidate_snapshots(user_id, new_period, db)

    await db.commit()
    await db.refresh(expense)
    return expense


async def delete(user_id: UUID, expense_id: UUID, db: AsyncSession) -> None:
    result = await db.execute(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.user_id == user_id,
        )
    )
    expense = result.scalar_one_or_none()
    if not expense:
        raise NotFound("Expense not found")

    period = period_of(expense.expense_date)
    await db.delete(expense)
    await db.flush()

    await invalidate_snapshots(user_id, period, db)
    await db.commit()
