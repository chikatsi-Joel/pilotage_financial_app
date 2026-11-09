from fastapi import APIRouter

from app.api.deps import UserDep
from app.schemas.common import UserRead

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/{user_id}", response_model=UserRead)
async def read_user(user: UserDep):
    return user
