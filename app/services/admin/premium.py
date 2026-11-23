"""Onglet Premium du backoffice : recherche d'un compte et activation manuelle du premium
(en attendant le paiement intégré), avec la consommation IA du mois."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AIUsage, User
from app.services import ai_quota
from app.services.errors import NotFound

log = logging.getLogger(__name__)

SEARCH_LIMIT = 20
# Durée d'un mois de premium accordé à la main.
MONTH = timedelta(days=30)


def _row(user: Any, used: int, now: datetime) -> dict[str, Any]:
    until = user.premium_until
    if until is not None and until.tzinfo is None:
        until = until.replace(tzinfo=UTC)
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "created_at": user.created_at,
        "premium_until": until,
        "premium": ai_quota.is_premium(until, now),
        "ai_used_this_month": used,
    }


async def search(db: AsyncSession, q: str, now: datetime | None = None) -> dict[str, Any]:
    """Comptes dont l'e-mail ou le nom contient `q` (vide : premium actifs d'abord, puis
    derniers inscrits), avec leurs analyses IA du mois. Deux requêtes, pas de N+1."""
    now = now or datetime.now(UTC)
    start, _ = ai_quota.month_bounds(now)
    used = (
        select(AIUsage.user_id, func.count().label("n"))
        .where(AIUsage.created_at >= start)
        .group_by(AIUsage.user_id)
        .subquery()
    )
    query = select(
        User.id, User.email, User.name, User.created_at, User.premium_until, used.c.n
    ).outerjoin(used, used.c.user_id == User.id)
    q = q.strip()
    if q:
        # % et _ saisis sont cherchés tels quels, pas comme jokers.
        escaped = q.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        query = query.where(
            or_(
                func.lower(User.email).like(pattern, escape="\\"),
                func.lower(User.name).like(pattern, escape="\\"),
            )
        )
    query = query.order_by(
        User.premium_until.desc().nulls_last(), User.created_at.desc()
    ).limit(SEARCH_LIMIT)
    rows = (await db.execute(query)).all()
    enabled, limit = await ai_quota.freemium_settings()
    return {
        "freemium_enabled": enabled,
        "free_quota": limit,
        "users": [_row(r, int(r.n or 0), now) for r in rows],
    }


async def set_premium(
    db: AsyncSession,
    user_id: UUID,
    months: int | None,
    admin_email: str,
    now: datetime | None = None,
) -> dict[str, Any]:
    """`months` > 0 : prolonge le premium de `months` × 30 jours (à partir de sa fin s'il est
    encore actif, sinon de maintenant) ; None ou 0 : retire le premium. Ligne verrouillée
    (FOR UPDATE) : deux prolongations simultanées s'additionnent. Chaque changement est tracé."""
    now = now or datetime.now(UTC)
    row = (
        await db.execute(
            select(User.premium_until).where(User.id == user_id).with_for_update()
        )
    ).first()
    if row is None:
        raise NotFound("Compte introuvable")
    current = row.premium_until
    if current is not None and current.tzinfo is None:
        current = current.replace(tzinfo=UTC)
    if months:
        base = current if current is not None and current > now else now
        until: datetime | None = base + months * MONTH
    else:
        until = None
    await db.execute(update(User).where(User.id == user_id).values(premium_until=until))
    await db.commit()
    # Champs dans le message : sans formatter structuré, les `extra` ne sont pas imprimés.
    log.warning(
        "premium_changed admin=%s user=%s months=%s old=%s new=%s",
        admin_email,
        user_id,
        months,
        current.isoformat() if current else None,
        until.isoformat() if until else None,
        extra={
            "admin_email": admin_email,
            "user_id": str(user_id),
            "months": months,
            "old_until": current.isoformat() if current else None,
            "new_until": until.isoformat() if until else None,
        },
    )
    user = await db.get(User, user_id, populate_existing=True)
    return _row(user, await ai_quota.used_this_month(user_id, db, now), now)
