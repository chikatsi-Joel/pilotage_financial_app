from __future__ import annotations

from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.schemas.common import UserCreate


async def create_user(payload: UserCreate, db: AsyncSession) -> User:
    user = User(
        name=payload.name,
        currency=payload.currency.upper(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user

async def list_users(db: AsyncSession, skip: int = 0, limit: int = 100) -> List[User]:

    users  = await db.execute(
        select(User).offset(skip).limit(limit)
    )

    return list(users.scalars().all())