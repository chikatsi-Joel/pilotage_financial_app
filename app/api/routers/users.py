from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_user
from app.db.session import get_db
from app.models import User
from app.schemas.common import UserCreate, UserRead

router = APIRouter(prefix="/users", tags=["users"])


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    user = User(name=payload.name, currency=payload.currency.upper())
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/{user_id}", response_model=UserRead)
async def read_user(user: User = Depends(get_user)):
    return user
