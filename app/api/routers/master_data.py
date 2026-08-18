from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.api.deps import DbSession, UserDep
from app.models import (
    Category, CategoryType, Essentiality,
    OptimizationPotential,
)
from app.schemas.common import CategoryCreate, CategoryRead

router = APIRouter(
    prefix="/users/{user_id}/categories",
    tags=["categories"],
)

_NOT_FOUND = {404: {"description": "Catégorie introuvable"}}


class CategoryUpdate(BaseModel):
    name: str | None = Field(
        default=None, min_length=1, max_length=120
    )
    essentiality: str | None = None
    optimization_potential: str | None = None
    active: bool | None = None


@router.post(
    "",
    response_model=CategoryRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_category(
    payload: CategoryCreate,
    user: UserDep,
    db: DbSession,
):
    try:
        essentiality = Essentiality(
            payload.essentiality.upper()
        )
        optimization = OptimizationPotential(
            payload.optimization_potential.upper()
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail="Invalid essentiality or optimization_potential",
        ) from exc
    category = Category(
        user_id=user.id,
        name=payload.name.strip(),
        category_type=CategoryType.EXPENSE,
        essentiality=essentiality,
        optimization_potential=optimization,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    return category


@router.get("", response_model=list[CategoryRead])
async def list_categories(
    user: UserDep,
    db: DbSession,
):
    result = await db.execute(
        select(Category)
        .where(Category.user_id == user.id)
        .order_by(Category.name)
    )
    return result.scalars().all()


@router.put(
    "/{category_id}",
    response_model=CategoryRead,
    responses=_NOT_FOUND,
)
async def update_category(
    category_id: UUID,
    payload: CategoryUpdate,
    user: UserDep,
    db: DbSession,
):
    category = await db.get(Category, category_id)
    if not category or category.user_id != user.id:
        raise HTTPException(
            status_code=404, detail="Category not found"
        )
    if payload.name is not None:
        category.name = payload.name.strip()
    if payload.essentiality is not None:
        category.essentiality = Essentiality(
            payload.essentiality.upper()
        )
    if payload.optimization_potential is not None:
        category.optimization_potential = OptimizationPotential(
            payload.optimization_potential.upper()
        )
    if payload.active is not None:
        category.active = payload.active
    await db.commit()
    await db.refresh(category)
    return category
