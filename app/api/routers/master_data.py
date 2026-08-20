from fastapi import APIRouter, HTTPException, Query, status

from app.api.deps import DbSession, UserDep
from app.schemas.common import (
    CategoryCreate,
    CategoryRead,
    CategoryUpdate,
    PaginatedResponse,
)
from app.services import category_service
from app.services.category_service import InvalidEnum, NotFound

router = APIRouter(
    prefix="/users/{user_id}/categories",
    tags=["categories"],
)

_NOT_FOUND = {404: {"description": "Catégorie introuvable"}}


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
        return await category_service.create(
            user.id, payload, db
        )
    except InvalidEnum as exc:
        raise HTTPException(
            status_code=422, detail=str(exc)
        ) from exc


@router.get("", response_model=PaginatedResponse[CategoryRead])
async def list_categories(
    user: UserDep,
    db: DbSession,
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
):
    items, next_cursor, has_more = await category_service.list_by_user(
        user.id, db, cursor=cursor, limit=limit,
    )
    return PaginatedResponse(
        items=items, next_cursor=next_cursor, has_more=has_more,
    )


@router.put(
    "/{category_id}",
    response_model=CategoryRead,
    responses=_NOT_FOUND,
)
async def update_category(
    category_id,
    payload: CategoryUpdate,
    user: UserDep,
    db: DbSession,
):
    try:
        return await category_service.update(
            user.id, category_id, payload, db
        )
    except NotFound as exc:
        raise HTTPException(
            status_code=404, detail=str(exc)
        ) from exc
    except InvalidEnum as exc:
        raise HTTPException(
            status_code=422, detail=str(exc)
        ) from exc
