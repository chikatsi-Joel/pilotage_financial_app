from fastapi import APIRouter, status

from app.api.deps import DbSession, UserDep
from app.schemas.common import UserCreate, UserRead
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.post(
    "",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_user(payload: UserCreate, db: DbSession):
    return await user_service.create_user(payload, db)


@router.get("/{user_id}", response_model=UserRead)
async def read_user(user: UserDep):
    return user
