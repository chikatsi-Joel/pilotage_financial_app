from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.db.session import get_db
from app.models import User, Category


async def get_user(user_id: UUID, db: AsyncSession = Depends(get_db)) -> User:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


async def get_category_for_user(category_id: UUID, user: User, db: AsyncSession) -> Category:
    result = await db.execute(select(Category).where(Category.id == category_id, Category.user_id == user.id))
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return category
