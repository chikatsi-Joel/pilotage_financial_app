from fastapi import APIRouter, status

from app.api.deps import DbSession, UserDep
from app.models import User
from app.schemas.common import UserCreate, UserRead

router = APIRouter(prefix="/users", tags=["users"])

#my userid = 5f9b214a-c895-412f-aac9-36065e9e2302

@router.post(
    "",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_user(
    payload: UserCreate, db: DbSession
):
    user = User(
        name=payload.name,
        currency=payload.currency.upper(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserRead)
async def read_user(user: UserDep):
    return user
