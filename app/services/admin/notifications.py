"""Onglet Notifications du backoffice : statistiques, historique, envois manuels."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import delete, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_session_factory
from app.db.upsert import insert_ignore
from app.models import NotificationLog, PushDevice, User
from app.services import push_service
from app.services.admin.kpi import notification_kind
from app.services.auth_service import normalize_email
from app.services.errors import Conflict, NotFound, ServiceError

log = logging.getLogger(__name__)

STATS_DAYS = 30

KIND_LABELS = {
    "budget": "Budget d'une catégorie",
    "month": "Budget du mois",
    "pace": "Rythme de dépense",
    "savings": "Palier d'épargne",
    "savings-idle": "Épargne sans versement",
    "daily": "Rappel quotidien",
    "weekly": "Résumé hebdomadaire",
    "ai": "Conseil IA",
    "admin": "Envoi manuel",
}


class PushDisabled(ServiceError):
    status_code = 409


def _label(kind: str) -> str:
    return KIND_LABELS.get(kind, kind)


def _require_push() -> None:
    if not settings.push_enabled:
        raise PushDisabled("Les notifications push sont désactivées sur le serveur (PUSH_ENABLED)")


async def stats(db: AsyncSession) -> dict[str, Any]:
    """Envois des 30 derniers jours par type, appareils par plateforme."""
    since = datetime.now(timezone.utc) - timedelta(days=STATS_DAYS)
    # Type = préfixe de la clé avant « : », agrégé en SQL (pas de chargement des clés).
    if db.get_bind().dialect.name == "postgresql":
        kind = func.split_part(NotificationLog.key, ":", 1)
    else:
        kind = func.substr(NotificationLog.key, 1, func.instr(NotificationLog.key, ":") - 1)
    rows = (
        await db.execute(
            select(kind, func.count())
            .where(NotificationLog.created_at >= since)
            .group_by(kind)
            .order_by(func.count().desc())
        )
    ).all()
    counts = [(str(k), int(n)) for k, n in rows]
    platforms = (
        await db.execute(select(PushDevice.platform, func.count()).group_by(PushDevice.platform))
    ).all()
    users_with_push = (
        await db.execute(select(func.count(distinct(PushDevice.user_id))))
    ).scalar_one()
    return {
        "push_enabled": settings.push_enabled,
        "days": STATS_DAYS,
        "by_kind": [
            {"kind": k, "label": _label(k), "count": n} for k, n in counts
        ],
        "devices": [{"platform": p, "count": int(n)} for p, n in platforms],
        "users_with_push": int(users_with_push),
    }


async def history(db: AsyncSession, limit: int, offset: int) -> dict[str, Any]:
    """Dernières notifications envoyées, avec le destinataire."""
    rows = (
        await db.execute(
            select(
                NotificationLog.id, NotificationLog.key, NotificationLog.created_at, User.email, User.name
            )
            .join(User, User.id == NotificationLog.user_id)
            .order_by(NotificationLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    total = (await db.execute(select(func.count()).select_from(NotificationLog))).scalar_one()
    return {
        "total": int(total),
        "items": [
            {
                "id": r.id,
                "key": r.key,
                "kind": notification_kind(r.key),
                "label": _label(notification_kind(r.key)),
                "created_at": r.created_at,
                "user_email": r.email,
                "user_name": r.name,
            }
            for r in rows
        ],
    }


async def forget(db: AsyncSession, log_id: UUID) -> None:
    """Efface une notification de l'historique : la vérification planifiée pourra la renvoyer."""
    result = await db.execute(delete(NotificationLog).where(NotificationLog.id == log_id))
    if result.rowcount == 0:
        raise NotFound("Notification introuvable")
    await db.commit()


async def _send(db: AsyncSession, user_id: UUID, title: str, body: str) -> int:
    accepted = await push_service.send_to_user(
        user_id, title, body, db, {"route": "/dashboard", "kind": "admin"}
    )
    if accepted:
        db.add(NotificationLog(user_id=user_id, key=f"admin:{uuid.uuid4()}"))
        await db.commit()
    return accepted


async def send_to_email(db: AsyncSession, email: str, title: str, body: str) -> dict[str, int]:
    """Envoie à tous les appareils d'un utilisateur ; renvoie le nombre d'appareils atteints."""
    _require_push()
    user = (
        await db.execute(select(User).where(User.email == normalize_email(email)))
    ).scalar_one_or_none()
    if user is None:
        raise NotFound("Aucun utilisateur avec cet e-mail")
    return {"users": 1, "accepted": await _send(db, user.id, title, body)}


# Diffusion en cours ou récente (processus) : une seule à la fois, pas de double envoi.
_broadcast: dict[str, Any] = {"running": False, "last": None}
_tasks: set[asyncio.Task] = set()
DUPLICATE_WINDOW = timedelta(minutes=10)
LOG_BATCH_SIZE = 1000
# Note : une diffusion interrompue par un arrêt du serveur n'est pas reprise (seul le log en garde trace).


async def broadcast(db: AsyncSession, title: str, body: str) -> dict[str, Any]:
    """Lance l'envoi à tous les appareils en arrière-plan (lots de 100) et répond tout de suite.

    Refuse une deuxième diffusion tant que la première tourne, ou le même message dans les
    10 minutes (double clic, nouvel essai après un délai d'attente).
    """
    _require_push()
    now = datetime.now(timezone.utc)
    last = _broadcast["last"]
    if _broadcast["running"]:
        raise Conflict("Une diffusion est déjà en cours")
    if last and last["message"] == (title, body) and now - last["at"] < DUPLICATE_WINDOW:
        raise Conflict("Ce message vient déjà d'être diffusé")
    # Réservé AVANT le premier await : une requête concurrente voit déjà la diffusion en cours.
    _broadcast["running"] = True
    _broadcast["last"] = {"message": (title, body), "at": now}
    try:
        devices = [
            (row.user_id, row.token)
            for row in (await db.execute(select(PushDevice.user_id, PushDevice.token))).all()
        ]
    except Exception:
        _broadcast["running"] = False
        _broadcast["last"] = last
        raise
    broadcast_id = uuid.uuid4()
    task = asyncio.create_task(_run_broadcast(broadcast_id, devices, title, body))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return {"users": len({u for u, _ in devices}), "devices": len(devices), "queued": True}


async def _run_broadcast(
    broadcast_id: UUID, devices: list[tuple[UUID, str]], title: str, body: str
) -> None:
    try:
        async with get_session_factory()() as db:
            reached, accepted = await push_service.send_bulk(
                devices, title, body, db, {"route": "/dashboard", "kind": "admin"}
            )
            rows = [{"id": uuid.uuid4(), "user_id": u, "key": f"admin:{broadcast_id}"} for u in reached]
            # Par lots : PostgreSQL limite une requête à 32 767 paramètres.
            for start in range(0, len(rows), LOG_BATCH_SIZE):
                await insert_ignore(
                    db, NotificationLog, rows[start : start + LOG_BATCH_SIZE], ["user_id", "key"]
                )
            await db.commit()
            log.info("Diffusion %s : %d appareils acceptés", broadcast_id, accepted)
    except Exception:
        log.exception("Échec de la diffusion %s", broadcast_id)
    finally:
        _broadcast["running"] = False
