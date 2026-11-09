from typing import Annotated

from fastapi import APIRouter, Header, status

from app.api.deps import CurrentUser, DbSession, TokenDep
from app.schemas.common import (
    AuthResponse,
    LoginRequest,
    PendingVerification,
    RegisterRequest,
    ResendRequest,
    UserRead,
    VerifyRequest,
)
from app.services import auth_service

router = APIRouter(prefix="/auth", tags=["auth"])

DeviceHeader = Annotated[str | None, Header(alias="User-Agent")]


@router.post("/register", response_model=PendingVerification, status_code=status.HTTP_202_ACCEPTED)
async def register(payload: RegisterRequest, db: DbSession):
    """Crée le compte et envoie un code par email ; la session s'ouvre après `/auth/verify`."""
    user = await auth_service.register(payload, db)
    return PendingVerification(email=user.email or payload.email)


@router.post("/verify", response_model=AuthResponse)
async def verify(payload: VerifyRequest, db: DbSession, device: DeviceHeader = None):
    user, token = await auth_service.verify_email(payload, device, db)
    return AuthResponse(token=token, user=UserRead.model_validate(user))


@router.post("/resend", status_code=status.HTTP_204_NO_CONTENT)
async def resend(payload: ResendRequest, db: DbSession) -> None:
    await auth_service.resend_code(payload, db)


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
