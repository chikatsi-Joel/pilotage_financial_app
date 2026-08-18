from __future__ import annotations

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
