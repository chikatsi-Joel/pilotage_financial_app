"""Comptes et sessions du backoffice, indépendants des comptes de l'app.

Session = jeton aléatoire dans un cookie httpOnly ; seule son empreinte SHA-256 est en base.
Les tentatives de connexion sont limitées par adresse e-mail (mémoire du processus).
"""

from __future__ import annotations

import asyncio
import hashlib
import secrets
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import AdminSession, AdminUser
from app.services.auth_service import _DUMMY_HASH, hash_password, normalize_email, verify_password
from app.services.errors import TooManyRequests, Unauthorized

COOKIE_NAME = "lucia_admin"
MAX_FAILURES = 5
FAILURE_WINDOW_SECONDS = 15 * 60
MIN_PASSWORD_LENGTH = 12

MAX_FAILURES_PER_IP = 20
MAX_TRACKED = 10_000

# Tentatives récentes par clé (« email:… », « ip:… »), en mémoire du processus.
_failures: dict[str, list[float]] = {}


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _recent(key: str, now: float) -> list[float]:
    recent = [t for t in _failures.get(key, []) if now - t < FAILURE_WINDOW_SECONDS]
    if recent:
        _failures[key] = recent
    else:
        _failures.pop(key, None)
    return recent


def _reserve_attempt(email: str, ip: str | None) -> list[str]:
    """Compte la tentative AVANT de vérifier le mot de passe (pas de rafale parallèle possible).

    Limites : 5 échecs par e-mail et 20 par adresse IP sur 15 minutes. Renvoie les clés à
    libérer si la connexion réussit.
    """
    now = time.monotonic()
    if len(_failures) > MAX_TRACKED:
        for key in list(_failures):
            _recent(key, now)
        if len(_failures) > MAX_TRACKED:
            _failures.clear()
    keys = [(f"email:{email}", MAX_FAILURES)]
    if ip:
        keys.append((f"ip:{ip}", MAX_FAILURES_PER_IP))
    for key, limit in keys:
        if len(_recent(key, now)) >= limit:
            raise TooManyRequests("Trop de tentatives : réessayez dans 15 minutes")
    for key, _ in keys:
        _failures.setdefault(key, []).append(now)
    return [k for k, _ in keys]


async def create_admin(email: str, password: str, db: AsyncSession) -> AdminUser:
    """Crée le compte, ou change son mot de passe s'il existe déjà."""
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Mot de passe trop court ({MIN_PASSWORD_LENGTH} caractères minimum)")
    email = normalize_email(email)
    password_hash = await asyncio.to_thread(hash_password, password)
    admin = (await db.execute(select(AdminUser).where(AdminUser.email == email))).scalar_one_or_none()
    if admin is None:
        admin = AdminUser(email=email, password_hash=password_hash)
        db.add(admin)
    else:
        admin.password_hash = password_hash
        await db.execute(delete(AdminSession).where(AdminSession.admin_id == admin.id))
    await db.commit()
    return admin


async def login(email: str, password: str, db: AsyncSession, ip: str | None = None) -> str:
    """Vérifie les identifiants et ouvre une session ; renvoie le jeton à mettre en cookie."""
    email = normalize_email(email)
    attempt_keys = _reserve_attempt(email, ip)
    admin = (await db.execute(select(AdminUser).where(AdminUser.email == email))).scalar_one_or_none()
    stored = admin.password_hash if admin else _DUMMY_HASH
    valid = await asyncio.to_thread(verify_password, password, stored)
    if admin is None or not valid:
        raise Unauthorized("Identifiants incorrects")
    for key in attempt_keys:  # succès : la tentative ne compte pas comme un échec
        _failures.pop(key, None)
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    db.add(
        AdminSession(
            token_hash=_sha256(token),
            admin_id=admin.id,
            expires_at=now + timedelta(hours=settings.admin_session_hours),
        )
    )
    admin.last_login_at = now
    # Ménage des sessions expirées de ce compte.
    await db.execute(
        delete(AdminSession).where(AdminSession.admin_id == admin.id, AdminSession.expires_at < now)
    )
    await db.commit()
    return token


async def authenticate(token: str | None, db: AsyncSession) -> AdminUser | None:
    if not token:
        return None
    row = (
        await db.execute(
            select(AdminSession, AdminUser)
            .join(AdminUser, AdminUser.id == AdminSession.admin_id)
            .where(AdminSession.token_hash == _sha256(token))
        )
    ).first()
    if row is None:
        return None
    session, admin = row
    expires = session.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        return None
    return admin


async def logout(token: str | None, db: AsyncSession) -> None:
    if token:
        await db.execute(delete(AdminSession).where(AdminSession.token_hash == _sha256(token)))
        await db.commit()
