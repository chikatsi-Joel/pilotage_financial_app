from typing import List

from fastapi import APIRouter, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import DbSession, UserDep
from app.schemas.common import UserCreate, UserRead
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.post(
    "",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_user(
    payload: UserCreate, db: DbSession
):
    return await user_service.create_user(payload, db)

@router.get("",
            response_model=List[UserRead],
            status_code=status.HTTP_200_OK)
async def get_users(db: AsyncSession, skip: int = 0, limit: int = 100):
    return await user_service.list_users(db, skip, limit)

@router.get("/{user_id}", response_model=UserRead)
async def read_user(user: UserDep, user_id: str):
    return user
