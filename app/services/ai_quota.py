"""Freemium de l'analyse IA : quota mensuel d'appels au modèle pour les comptes gratuits.

- Réglages (backoffice, table app_settings) : `ai_freemium_enabled` (interrupteur) et
  `ai_free_quota` (appels par mois calendaire UTC). Interrupteur coupé : IA illimitée.
- Compte premium (`users.premium_until` dans le futur) : jamais limité.
- « Compté » (metered) = freemium actif ET compte gratuit. Seuls ces appels sont enregistrés
  dans `ai_usage` : activer le freemium en cours de mois, ou perdre le premium, repart de 0.
- Réservation : sous verrou consultatif par utilisateur, le quota est compté puis une ligne
  `ai_usage` (mois analysé + empreinte du contexte) insérée et validée AVANT l'appel au modèle
  (plusieurs secondes) ; elle est supprimée si l'appel échoue. Une réservation en cours pour la
  même empreinte n'en crée pas une seconde (deux écrans ouverts en même temps : une seule unité).
"""

from __future__ import annotations

import enum
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AIUsage, User
from app.services import settings_store

DEFAULT_QUOTA = 3
# Durée maximale d'un appel au modèle (timeout serveur ~60 s) avec marge : au-delà, une
# réservation non rendue (processus tué) ne bloque plus une nouvelle analyse.
IN_FLIGHT_WINDOW = timedelta(minutes=3)


@dataclass(frozen=True)
class Quota:
    """État du quota d'un utilisateur pour le mois en cours.

    `metered` : ses appels au modèle sont comptés (freemium actif et compte gratuit).
    `limit`/`remaining` None : pas de limite.
    """

    enabled: bool
    premium: bool
    limit: int | None
    used: int
    remaining: int | None
    resets_at: datetime

    @property
    def metered(self) -> bool:
        return self.limit is not None

    def as_dict(self) -> dict:
        return {
            "enabled": self.enabled,
            "premium": self.premium,
            "limit": self.limit,
            "used": self.used,
            "remaining": self.remaining,
            "resets_at": self.resets_at.isoformat(),
        }


class Reservation(enum.Enum):
    EXCEEDED = "exceeded"
    IN_FLIGHT = "in_flight"


def month_bounds(now: datetime) -> tuple[datetime, datetime]:
    """Début du mois calendaire UTC de `now` et début du mois suivant."""
    start = now.astimezone(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        return start, start.replace(year=start.year + 1, month=1)
    return start, start.replace(month=start.month + 1)


def _aware(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:  # SQLite (tests) : horodatage naïf en UTC
        return value.replace(tzinfo=UTC)
    return value


def parse_quota(raw: str) -> int | None:
    """Entier ASCII entre 0 et 1000, sinon None (« ² » ou « ٣ » refusés)."""
    raw = raw.strip()
    if not (raw.isascii() and raw.isdecimal()):
        return None
    value = int(raw)
    return value if value <= 1000 else None


async def freemium_settings() -> tuple[bool, int]:
    """(freemium actif, analyses gratuites par mois) ; quota illisible : DEFAULT_QUOTA."""
    enabled = (await settings_store.get("ai_freemium_enabled")).strip().lower() == "true"
    limit = parse_quota(await settings_store.get("ai_free_quota"))
    return enabled, DEFAULT_QUOTA if limit is None else limit


def is_premium(premium_until: datetime | None, now: datetime) -> bool:
    until = _aware(premium_until)
    return until is not None and until > now


async def used_this_month(user_id: UUID, db: AsyncSession, now: datetime) -> int:
    start, _ = month_bounds(now)
    return int(
        (
            await db.execute(
                select(func.count()).select_from(AIUsage).where(
                    AIUsage.user_id == user_id, AIUsage.created_at >= start
                )
            )
        ).scalar_one()
    )


async def status(user_id: UUID, db: AsyncSession, now: datetime | None = None) -> Quota:
    """Quota du mois en cours (lecture seule)."""
    now = now or datetime.now(UTC)
    _, end = month_bounds(now)
    enabled, limit = await freemium_settings()
    premium_until = (
        await db.execute(select(User.premium_until).where(User.id == user_id))
    ).scalar_one_or_none()
    premium = is_premium(premium_until, now)
    used = await used_this_month(user_id, db, now)
    if not enabled or premium:
        return Quota(enabled, premium, None, used, None, end)
    return Quota(enabled, premium, limit, used, max(0, limit - used), end)


async def _lock(user_id: UUID, db: AsyncSession) -> None:
    """Sérialise les réservations d'un utilisateur (PostgreSQL ; SQLite sérialise déjà)."""
    if db.get_bind().dialect.name == "postgresql":
        await db.execute(
            select(func.pg_advisory_xact_lock(func.hashtextextended(f"ai_quota:{user_id}", 0)))
        )


async def reserve(
    user_id: UUID,
    period: str,
    context_hash: str,
    db: AsyncSession,
    now: datetime | None = None,
) -> UUID | Reservation:
    """Réserve un appel compté au modèle pour (mois analysé, empreinte).

    Renvoie l'identifiant de la réservation, `IN_FLIGHT` si la même analyse est déjà en cours
    (aucune unité consommée), ou `EXCEEDED` si le quota du mois est épuisé. Valide la
    transaction (libère le verrou) avant de rendre la main : l'appel au modèle se fait hors
    transaction. À n'appeler que pour un utilisateur compté (`Quota.metered`).
    """
    now = now or datetime.now(UTC)
    await _lock(user_id, db)
    in_flight = (
        await db.execute(
            select(AIUsage.id).where(
                AIUsage.user_id == user_id,
                AIUsage.period == period,
                AIUsage.context_hash == context_hash,
                AIUsage.created_at > now - IN_FLIGHT_WINDOW,
            ).limit(1)
        )
    ).scalar_one_or_none()
    if in_flight is not None:
        await db.commit()
        return Reservation.IN_FLIGHT
    quota = await status(user_id, db, now)
    if quota.remaining is not None and quota.remaining <= 0:
        await db.commit()
        return Reservation.EXCEEDED
    # Identifiant fixé ici : après le commit, l'objet expire et ne doit plus être relu.
    usage_id = uuid4()
    db.add(
        AIUsage(
            id=usage_id, user_id=user_id, period=period, context_hash=context_hash, created_at=now
        )
    )
    await db.commit()
    return usage_id


async def release(usage_id: UUID, db: AsyncSession) -> None:
    """Rend une réservation (appel échoué : réponse de secours ou illisible, exception)."""
    await db.execute(delete(AIUsage).where(AIUsage.id == usage_id))
    await db.commit()
