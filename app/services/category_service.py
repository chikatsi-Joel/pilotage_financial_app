from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Category,
    CategoryType,
    Essentiality,
    OptimizationPotential,
)
from app.schemas.common import CategoryCreate, CategoryUpdate
from app.services.pagination import paginate


class NotFound(Exception):
    pass


class InvalidEnum(Exception):
    pass


async def create(user_id: UUID, payload: CategoryCreate, db: AsyncSession) -> Category:
    try:
        essentiality = Essentiality(payload.essentiality.upper())
        optimization = OptimizationPotential(payload.optimization_potential.upper())
    except ValueError as exc:
        raise InvalidEnum(
            "Invalid essentiality or optimization_potential"
        ) from exc

    category = Category(
        user_id=user_id,
        name=payload.name.strip(),
        category_type=CategoryType.EXPENSE,
        essentiality=essentiality,
        optimization_potential=optimization,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


async def list_by_user(
    user_id: UUID,
    db: AsyncSession,
    *,
    cursor: str | None = None,
    limit: int = 20,
) -> tuple[list[Category], str | None, bool]:
    query = select(Category).where(Category.user_id == user_id)

    return await paginate(
        db, query, limit, cursor,
        id_col=Category.id, sort_col=Category.name, sort_desc=False,
    )


async def update(
    user_id: UUID, category_id: UUID, payload: CategoryUpdate, db: AsyncSession
) -> Category:
    category = await db.get(Category, category_id)
    if not category or category.user_id != user_id:
        raise NotFound("Category not found")

    if payload.name is not None:
        category.name = payload.name.strip()
    if payload.essentiality is not None:
        try:
            category.essentiality = Essentiality(payload.essentiality.upper())
        except ValueError as exc:
            raise InvalidEnum("Invalid essentiality") from exc
    if payload.optimization_potential is not None:
        try:
            category.optimization_potential = OptimizationPotential(
                payload.optimization_potential.upper()
            )
        except ValueError as exc:
            raise InvalidEnum("Invalid optimization_potential") from exc
    if payload.active is not None:
        category.active = payload.active

    await db.commit()
    await db.refresh(category)
    return category
