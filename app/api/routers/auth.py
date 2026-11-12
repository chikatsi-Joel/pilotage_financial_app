from typing import Annotated

from fastapi import APIRouter, Header, Response, status

from app.api.deps import Credentials, CurrentUser, DbSession, TokenDep
from app.schemas.common import (
    AuthResponse,
    FirebaseSignInRequest,
    FirebaseTokenRequest,
    FirebaseVerifyRequest,
    LoginRequest,
    PendingVerification,
    RegisterRequest,
    ResendRequest,
    UserRead,
    VerifyRequest,
)
from app.services import auth_service, firebase_auth

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


@router.post(
    "/firebase",
    response_model=AuthResponse | PendingVerification,
    responses={202: {"model": PendingVerification}},
)
async def firebase_sign_in(
    payload: FirebaseSignInRequest,
    response: Response,
    db: DbSession,
    credentials: Credentials,
    device: DeviceHeader = None,
):
    """Échange un ID token Firebase contre une session Lucia.

    202 : l'email doit être confirmé avec le code envoyé (/auth/firebase/verify).
    Une session Lucia déjà ouverte (en-tête Bearer) sur le même email suffit à
    rattacher un compte existant sans code (migration depuis l'ancienne connexion).
    """
    identity = await firebase_auth.verify_id_token(payload.id_token)
    current = (
        await auth_service.authenticate(credentials.credentials, db)
        if credentials and credentials.credentials
        else None
    )
    user, token = await auth_service.firebase_sign_in(identity, payload, device, current, db)
    if token is None:
        response.status_code = status.HTTP_202_ACCEPTED
        return PendingVerification(email=user.email or identity.email or "")
    return AuthResponse(token=token, user=UserRead.model_validate(user))


@router.post("/firebase/verify", response_model=AuthResponse)
async def firebase_verify(payload: FirebaseVerifyRequest, db: DbSession, device: DeviceHeader = None):
    identity = await firebase_auth.verify_id_token(payload.id_token)
    user, token = await auth_service.firebase_verify(identity, payload.code, device, db)
    return AuthResponse(token=token, user=UserRead.model_validate(user))


@router.post("/firebase/resend", status_code=status.HTTP_204_NO_CONTENT)
async def firebase_resend(payload: FirebaseTokenRequest, db: DbSession) -> None:
    identity = await firebase_auth.verify_id_token(payload.id_token)
    await auth_service.firebase_resend(identity, db)


@router.get("/me", response_model=UserRead)
async def me(user: CurrentUser):
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(token: TokenDep, db: DbSession) -> None:
    await auth_service.logout(token, db)
