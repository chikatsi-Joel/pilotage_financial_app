"""Appareils, préférences et envoi de notifications push via le service Expo.

L'envoi ne lève jamais d'exception : une notification ratée ne doit pas faire
échouer l'action de l'utilisateur (enregistrer une dépense, etc.).
"""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import NotificationPreference, PushDevice
from app.services import settings_store
from app.schemas.common import (
    DeviceRegister,
    NotificationPreferencesUpdate,
)

log = logging.getLogger(__name__)

EXPO_BATCH_SIZE = 100


# ── Appareils ────────────────────────────────────────────────────────────


async def register_device(user_id: UUID, payload: DeviceRegister, db: AsyncSession) -> None:
    """Associe le jeton à l'utilisateur (un téléphone partagé change de propriétaire)."""
    device = (
        await db.execute(select(PushDevice).where(PushDevice.token == payload.token))
    ).scalar_one_or_none()
    if device is None:
        db.add(PushDevice(user_id=user_id, token=payload.token, platform=payload.platform))
    else:
        device.user_id = user_id
        device.platform = payload.platform
    if payload.timezone:
        prefs = await get_preferences(user_id, db)
        prefs.timezone = payload.timezone
    await db.commit()


async def unregister_device(user_id: UUID, token: str, db: AsyncSession) -> None:
    await db.execute(
        delete(PushDevice).where(PushDevice.user_id == user_id, PushDevice.token == token)
    )
    await db.commit()


# ── Préférences ──────────────────────────────────────────────────────────


async def get_preferences(user_id: UUID, db: AsyncSession) -> NotificationPreference:
    """Préférences de l'utilisateur, créées avec les valeurs par défaut si absentes."""
    prefs = await db.get(NotificationPreference, user_id)
    if prefs is None:
        prefs = NotificationPreference(
            user_id=user_id,
            budget_alerts=True,
            savings_milestones=True,
            daily_reminder=False,
            daily_reminder_hour=20,
            weekly_summary=True,
            ai_insights=True,
            timezone="UTC",
        )
        db.add(prefs)
        await db.flush()
    return prefs


async def update_preferences(
    user_id: UUID, payload: NotificationPreferencesUpdate, db: AsyncSession
) -> NotificationPreference:
    prefs = await get_preferences(user_id, db)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(prefs, field, value)
    await db.commit()
    return prefs


# ── Envoi ────────────────────────────────────────────────────────────────


async def _post_expo(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Envoie un lot (≤ 100) au service Expo et renvoie un ticket par message."""
    headers = {"Accept": "application/json", "Content-Type": "application/json"}
    token = await settings_store.get("expo_access_token")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=settings.push_timeout) as client:
        response = await client.post(settings.expo_push_url, json=messages, headers=headers)
        response.raise_for_status()
        return response.json().get("data", [])


# Catégorie Android (canal) de chaque type de notification ; créées par l'app mobile.
CHANNEL_BY_KIND = {
    "budget": "budget",
    "month_budget": "budget",
    "pace": "budget",
    "savings": "savings",
    "savings_idle": "savings",
    "daily": "reminders",
    "weekly": "summaries",
    "ai": "summaries",
}


def _sticker_url(data: dict[str, Any]) -> str | None:
    """Adresse du sticker affiché à droite de la notification (`data["sticker"]`)."""
    name = data.get("sticker")
    base = settings.push_sticker_base_url.rstrip("/")
    return f"{base}/{name}.png" if name and base else None


async def send_to_user(
    user_id: UUID,
    title: str,
    body: str,
    db: AsyncSession,
    data: dict[str, Any] | None = None,
) -> int:
    """Envoie la notification à tous les appareils de l'utilisateur ; renvoie le nombre d'acceptés."""
    if not settings.push_enabled:
        return 0
    try:
        devices = (
            await db.execute(select(PushDevice).where(PushDevice.user_id == user_id))
        ).scalars().all()
        if not devices:
            return 0

        accepted = 0
        dead: list[str] = []
        for start in range(0, len(devices), EXPO_BATCH_SIZE):
            batch = devices[start : start + EXPO_BATCH_SIZE]
            payload = data or {}
            sticker = _sticker_url(payload)
            messages = [
                {
                    "to": d.token,
                    "title": title,
                    "body": body,
                    "data": payload,
                    "sound": "default",
                    "channelId": CHANNEL_BY_KIND.get(payload.get("kind", ""), "default"),
                    **({"richContent": {"image": sticker}} if sticker else {}),
                }
                for d in batch
            ]
            tickets = await _post_expo(messages)
            for device, ticket in zip(batch, tickets):
                if ticket.get("status") == "ok":
                    accepted += 1
                elif (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
                    dead.append(device.token)
                else:
                    log.warning("Push refusé pour un appareil : %s", ticket.get("message"))
        if dead:
            await db.execute(delete(PushDevice).where(PushDevice.token.in_(dead)))
            await db.commit()
        return accepted
    except Exception:
        log.exception("Échec d'envoi de notification push à %s", user_id)
        return 0


async def send_bulk(
    devices: list[tuple[UUID, str]],
    title: str,
    body: str,
    db: AsyncSession,
    data: dict[str, Any] | None = None,
) -> tuple[set[UUID], int]:
    """Même message à de nombreux appareils (user_id, jeton), par lots de 100 vers Expo.

    Renvoie les utilisateurs atteints et le nombre d'appareils acceptés. Un lot en échec
    (réseau) est journalisé et n'interrompt pas les suivants.
    """
    if not settings.push_enabled or not devices:
        return set(), 0
    payload = data or {}
    sticker = _sticker_url(payload)
    channel = CHANNEL_BY_KIND.get(payload.get("kind", ""), "default")
    reached: set[UUID] = set()
    accepted = 0
    dead: list[str] = []
    for start in range(0, len(devices), EXPO_BATCH_SIZE):
        batch = devices[start : start + EXPO_BATCH_SIZE]
        messages = [
            {
                "to": token,
                "title": title,
                "body": body,
                "data": payload,
                "sound": "default",
                "channelId": channel,
                **({"richContent": {"image": sticker}} if sticker else {}),
            }
            for _, token in batch
        ]
        try:
            tickets = await _post_expo(messages)
        except Exception:
            log.exception("Échec d'un lot d'envoi groupé (%d appareils)", len(batch))
            continue
        for (user_id, token), ticket in zip(batch, tickets):
            if ticket.get("status") == "ok":
                accepted += 1
                reached.add(user_id)
            elif (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
                dead.append(token)
    if dead:
        await db.execute(delete(PushDevice).where(PushDevice.token.in_(dead)))
        await db.commit()
    return reached, accepted
