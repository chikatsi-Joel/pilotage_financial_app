"""API du backoffice (/admin/api) : session admin par cookie, KPI, notifications, flags, config.

Protection CSRF : cookie SameSite=Strict, et toute requête qui modifie quelque chose doit porter
l'en-tête `X-Lucia-Admin: 1` (qu'un formulaire d'un autre site ne peut pas ajouter).
"""

from __future__ import annotations

from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends, HTTPException, Path, Query, Request, Response, status
from pydantic import BaseModel, Field

from app.api.deps import DbSession
from app.core.config import settings
from app.models import AdminUser
from app.services import settings_store
from app.services.admin import auth as admin_auth
from app.services.admin import kpi, remote_config, sql_stats
from app.services.admin import notifications as admin_notifications

router = APIRouter(prefix="/admin/api", tags=["admin"])

CSRF_HEADER = "x-lucia-admin"
BROADCAST_CONFIRMATION = "ENVOYER"


async def get_admin(
    request: Request,
    db: DbSession,
    token: Annotated[str | None, Cookie(alias=admin_auth.COOKIE_NAME)] = None,
) -> AdminUser:
    admin = await admin_auth.authenticate(token, db)
    if admin is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session admin requise")
    if request.method not in ("GET", "HEAD") and request.headers.get(CSRF_HEADER) != "1":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="En-tête admin manquant")
    return admin


Admin = Annotated[AdminUser, Depends(get_admin)]


# ── Session ──────────────────────────────────────────────────────────────


class LoginBody(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class AdminMe(BaseModel):
    email: str


@router.post("/login", response_model=AdminMe)
async def login(body: LoginBody, request: Request, response: Response, db: DbSession) -> AdminMe:
    if request.headers.get(CSRF_HEADER) != "1":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="En-tête admin manquant")
    client_ip = request.client.host if request.client else None
    token = await admin_auth.login(body.email, body.password, db, client_ip)
    response.set_cookie(
        admin_auth.COOKIE_NAME,
        token,
        max_age=settings.admin_session_hours * 3600,
        httponly=True,
        secure=settings.admin_cookie_is_secure,
        samesite="strict",
        path="/admin",
    )
    return AdminMe(email=admin_auth.normalize_email(body.email))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    db: DbSession,
    _: Admin,
    token: Annotated[str | None, Cookie(alias=admin_auth.COOKIE_NAME)] = None,
) -> None:
    await admin_auth.logout(token, db)
    response.delete_cookie(admin_auth.COOKIE_NAME, path="/admin")


@router.get("/me", response_model=AdminMe)
async def me(admin: Admin) -> AdminMe:
    return AdminMe(email=admin.email)


# ── Vue d'ensemble ───────────────────────────────────────────────────────


@router.get("/overview")
async def overview(_: Admin, db: DbSession) -> dict[str, Any]:
    return await kpi.overview(db)


# ── Notifications ────────────────────────────────────────────────────────


class PushBody(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=240)


class PushToUserBody(PushBody):
    email: str = Field(min_length=3, max_length=254)


class BroadcastBody(PushBody):
    confirmation: str


@router.get("/notifications/stats")
async def notification_stats(_: Admin, db: DbSession) -> dict[str, Any]:
    return await admin_notifications.stats(db)


@router.get("/notifications/history")
async def notification_history(
    _: Admin,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, Any]:
    return await admin_notifications.history(db, limit, offset)


@router.delete("/notifications/history/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def forget_notification(log_id: UUID, _: Admin, db: DbSession) -> None:
    await admin_notifications.forget(db, log_id)


@router.post("/notifications/send")
async def send_notification(body: PushToUserBody, _: Admin, db: DbSession) -> dict[str, int]:
    return await admin_notifications.send_to_email(db, body.email, body.title, body.body)


@router.post("/notifications/broadcast")
async def broadcast_notification(body: BroadcastBody, _: Admin, db: DbSession) -> dict[str, int]:
    if body.confirmation != BROADCAST_CONFIRMATION:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tapez {BROADCAST_CONFIRMATION} pour confirmer l'envoi à tous",
        )
    return await admin_notifications.broadcast(db, body.title, body.body)


# ── Requêtes SQL (pg_stat_statements) ────────────────────────────────────


@router.get("/sql-stats")
async def sql_statistics(
    _: Admin,
    db: DbSession,
    sort: sql_stats.SortKey = "total",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict[str, Any]:
    return await sql_stats.overview(db, sort, limit)


@router.post("/sql-stats/reset", status_code=status.HTTP_204_NO_CONTENT)
async def reset_sql_statistics(_: Admin, db: DbSession) -> None:
    await sql_stats.reset(db)


# ── Flags (Remote Config) ────────────────────────────────────────────────


class FlagBody(BaseModel):
    value: str = Field(max_length=10_000)
    value_type: Literal["STRING", "BOOLEAN", "NUMBER", "JSON"] | None = None
    description: str | None = Field(default=None, max_length=256)


@router.get("/flags")
async def flags(_: Admin) -> dict[str, Any]:
    return await remote_config.get_flags()


@router.put("/flags/{key}")
async def set_flag(
    key: Annotated[str, Path(pattern=r"^[A-Za-z_][A-Za-z0-9_]{0,255}$")],
    body: FlagBody,
    _: Admin,
) -> dict[str, Any]:
    return await remote_config.set_flag(key, body.value, body.value_type, body.description)


# ── Configuration générale ───────────────────────────────────────────────


class SettingBody(BaseModel):
    value: str = Field(min_length=1, max_length=20_000)
    secret: bool | None = None


@router.get("/settings")
async def list_settings(_: Admin, db: DbSession) -> list[dict[str, Any]]:
    return await settings_store.list_settings(db)


@router.put("/settings/{key}", status_code=status.HTTP_204_NO_CONTENT)
async def put_setting(key: str, body: SettingBody, admin: Admin, db: DbSession) -> None:
    await settings_store.set_value(db, key, body.value, body.secret, admin.email)


@router.delete("/settings/{key}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_setting(key: str, _: Admin, db: DbSession) -> None:
    await settings_store.delete_value(db, key)
