from fastapi import APIRouter

from app.api.deps import DbSession, UserDep
from app.schemas.common import UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/{user_id}", response_model=UserRead)
async def read_user(user: UserDep):
    return user


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(payload: UserUpdate, user: UserDep, db: DbSession):
    """Modifie les préférences du compte (devise d'affichage, code ISO 4217)."""
    if payload.currency is not None:
        user.currency = payload.currency.upper()
    await db.commit()
    await db.refresh(user)
    return user
