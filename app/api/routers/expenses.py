from datetime import date
from uuid import UUID

from fastapi import APIRouter, Query, status

from app.api.deps import DbSession, UserDep
from app.schemas.common import (
    ExpenseBulkCreate,
    ExpenseCreate,
    ExpenseDailyTotal,
    ExpenseRead,
    PaginatedResponse,
)
from app.services import expense_service, notification_service
from app.services.periods import period_of

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
    expense = await expense_service.create(user.id, payload, db)
    notification_service.schedule_budget_alerts(
        user.id, {(expense.category_id, period_of(expense.expense_date))}
    )
    return expense


@router.post(
    "/bulk",
    response_model=list[ExpenseRead],
    status_code=status.HTTP_201_CREATED,
    responses=_NOT_FOUND,
)
async def create_expenses_bulk(
    payload: ExpenseBulkCreate,
    user: UserDep,
    db: DbSession,
):
    created = await expense_service.create_many(user.id, payload.items, db)
    notification_service.schedule_budget_alerts(
        user.id, {(e.category_id, period_of(e.expense_date)) for e in created}
    )
    return created


@router.get("", response_model=PaginatedResponse[ExpenseRead])
async def list_expenses(
    user: UserDep,
    db: DbSession,
    from_date: date | None = None,
    to_date: date | None = None,
    category_id: UUID | None = None,
    q: str | None = Query(default=None, max_length=100),
    cursor: str | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=100),
):
    items, next_cursor, has_more = await expense_service.list_by_user(
        user.id, db, from_date, to_date, category_id,
        search=q, cursor=cursor, limit=limit,
    )
    return PaginatedResponse(
        items=items, next_cursor=next_cursor, has_more=has_more,
    )


@router.get("/daily", response_model=list[ExpenseDailyTotal])
async def daily_totals(
    user: UserDep,
    db: DbSession,
    from_date: date,
    to_date: date,
    category_id: UUID | None = None,
):
    rows = await expense_service.daily_totals(
        user.id, db, from_date, to_date, category_id
    )
    return [ExpenseDailyTotal(date=day, total=total) for day, total in rows]


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
    return await expense_service.update(
        user.id, expense_id, payload, db
    )
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
    await expense_service.delete(
        user.id, expense_id, db
    )