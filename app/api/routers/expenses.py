from datetime import date
from uuid import UUID

from fastapi import APIRouter, HTTPException, status

from app.api.deps import DbSession, UserDep
from app.schemas.common import ExpenseCreate, ExpenseRead
from app.services import expense_service
from app.services.expense_service import NotFound

router = APIRouter(
    prefix="/users/{user_id}/expenses", tags=["expenses"]
)

_NOT_FOUND = {404: {"description": "Ressource introuvable"}}


@router.post(
    "",
    response_model=ExpenseRead,
    status_code=status.HTTP_201_CREATED,
    responses=_NOT_FOUND,
)
async def create_expense(
    payload: ExpenseCreate,
    user: UserDep,
    db: DbSession,
):
    try:
        return await expense_service.create(
            user.id, payload, db
        )
    except NotFound as exc:
        raise HTTPException(
            status_code=404, detail=str(exc)
        ) from exc


@router.get("", response_model=list[ExpenseRead])
async def list_expenses(
    user: UserDep,
    db: DbSession,
    from_date: date | None = None,
    to_date: date | None = None,
    category_id: UUID | None = None,
):
    return await expense_service.list_by_user(
        user.id, db, from_date, to_date, category_id
    )


@router.put(
    "/{expense_id}",
    response_model=ExpenseRead,
    responses=_NOT_FOUND,
)
async def update_expense(
    expense_id: UUID,
    payload: ExpenseCreate,
    user: UserDep,
    db: DbSession,
):
    try:
        return await expense_service.update(
            user.id, expense_id, payload, db
        )
    except NotFound as exc:
        raise HTTPException(
            status_code=404, detail=str(exc)
        ) from exc


@router.delete(
    "/{expense_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=_NOT_FOUND,
)
async def delete_expense(
    expense_id: UUID,
    user: UserDep,
    db: DbSession,
):
    try:
        await expense_service.delete(
            user.id, expense_id, db
        )
    except NotFound as exc:
        raise HTTPException(
            status_code=404, detail=str(exc)
        ) from exc
