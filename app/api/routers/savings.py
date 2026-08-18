from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import DbSession, UserDep
from app.models import SavingsGoal
from app.schemas.common import SavingsGoalCreate, SavingsGoalRead

router = APIRouter(
    prefix="/users/{user_id}/savings-goals",
    tags=["savings"],
)


@router.post(
    "",
    response_model=SavingsGoalRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_goal(
    payload: SavingsGoalCreate,
    user: UserDep,
    db: DbSession,
):
    goal = SavingsGoal(
        user_id=user.id, **payload.model_dump()
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal


@router.get("", response_model=list[SavingsGoalRead])
async def list_goals(
    user: UserDep,
    db: DbSession,
):
    result = await db.execute(
        select(SavingsGoal)
        .where(
            SavingsGoal.user_id == user.id,
            SavingsGoal.active.is_(True),
        )
        .order_by(SavingsGoal.deadline)
    )
    return result.scalars().all()
