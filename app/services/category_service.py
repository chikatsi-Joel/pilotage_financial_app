from __future__ import annotations

from enum import Enum
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
from app.services.errors import InvalidEnum, NotFound
from app.services.pagination import paginate


def _parse_enum[E: Enum](enum_cls: type[E], value: str, label: str) -> E:
    """Convertit une saisie (insensible à la casse) en membre d'énumération."""
    try:
        return enum_cls(value.upper())
    except ValueError as exc:
        raise InvalidEnum(f"Invalid {label}") from exc


async def create(user_id: UUID, payload: CategoryCreate, db: AsyncSession) -> Category:
    essentiality = _parse_enum(Essentiality, payload.essentiality, "essentiality")
    optimization = _parse_enum(
        OptimizationPotential, payload.optimization_potential, "optimization_potential"
    )

    category = Category(
        user_id=user_id,
        name=payload.name.strip(),
        category_type=CategoryType.EXPENSE,
        essentiality=essentiality,
        optimization_potential=optimization,
        monthly_budget=payload.monthly_budget,
        icon=payload.icon,
        color=payload.color,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


async def list_by_user(
    user_id: UUID,
    db: AsyncSession, *, cursor: str | None = None, limit: int = 20,) -> tuple[list[Category], str | None, bool]:
    query = select(Category).where(Category.user_id == user_id)

    return await paginate(
        db, query, limit, cursor,
        id_col=Category.id, sort_col=Category.name, sort_desc=False,
    )


async def update( user_id: UUID, category_id: UUID, payload: CategoryUpdate, db: AsyncSession) -> Category:
    category = await db.get(Category, category_id)
    if not category or category.user_id != user_id:
        raise NotFound("Category not found")

    if payload.name is not None:
        category.name = payload.name.strip()
    if payload.essentiality is not None:
        category.essentiality = _parse_enum(
            Essentiality, payload.essentiality, "essentiality"
        )
    if payload.optimization_potential is not None:
        category.optimization_potential = _parse_enum(
            OptimizationPotential,
            payload.optimization_potential,
            "optimization_potential",
        )
    if payload.active is not None:
        category.active = payload.active
    if "monthly_budget" in payload.model_fields_set:
        category.monthly_budget = payload.monthly_budget
    if "icon" in payload.model_fields_set:
        category.icon = payload.icon
    if "color" in payload.model_fields_set:
        category.color = payload.color

    await db.commit()
    await db.refresh(category)
    return category
