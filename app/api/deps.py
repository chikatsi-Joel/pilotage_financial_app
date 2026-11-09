from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import User
from app.services import auth_service

_bearer = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db)]
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentification requise",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_token(credentials: Credentials) -> str:
    if credentials is None or not credentials.credentials:
        raise _unauthorized()
    return credentials.credentials


TokenDep = Annotated[str, Depends(get_token)]


async def get_current_user(token: TokenDep, db: DbSession) -> User:
    user = await auth_service.authenticate(token, db)
    if user is None:
        raise _unauthorized()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def get_user(user_id: UUID, current: CurrentUser) -> User:
    """Utilisateur ciblé par le chemin ; il doit être celui de la session."""
    if user_id != current.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès refusé")
    return current


UserDep = Annotated[User, Depends(get_user)]
