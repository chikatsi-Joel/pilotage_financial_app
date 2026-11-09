from typing import Annotated

from fastapi import APIRouter, Header, status

from app.api.deps import CurrentUser, DbSession, TokenDep
from app.schemas.common import AuthResponse, LoginRequest, RegisterRequest, UserRead
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

DeviceHeader = Annotated[str | None, Header(alias="User-Agent")]


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, db: DbSession, device: DeviceHeader = None):
    user, token = await auth_service.register(payload, device, db)
    return AuthResponse(token=token, user=UserRead.model_validate(user))


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, db: DbSession, device: DeviceHeader = None):
    user, token = await auth_service.login(payload, device, db)
    return AuthResponse(token=token, user=UserRead.model_validate(user))


@router.get("/me", response_model=UserRead)
async def me(user: CurrentUser):
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(token: TokenDep, db: DbSession) -> None:
    await auth_service.logout(token, db)
