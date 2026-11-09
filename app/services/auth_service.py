"""Authentification : comptes email + mot de passe, sessions d'appareil sans expiration.

Le jeton est une valeur aléatoire opaque ; seule son empreinte SHA-256 est
stockée. La session reste valide jusqu'à la déconnexion explicite (`logout`),
comme une session WhatsApp.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuthSession, User
from app.schemas.common import LoginRequest, RegisterRequest
from app.services.errors import Conflict, Unauthorized

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**14, 8, 1
_LAST_USED_REFRESH = timedelta(hours=1)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt_hex), n=int(n), r=int(r), p=int(p)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest, bytes.fromhex(digest_hex))


# Hash factice : une connexion sur un email inconnu coûte le même temps.
_DUMMY_HASH = hash_password("dummy-password")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def _open_session(user: User, device: str | None, db: AsyncSession) -> str:
    token = secrets.token_urlsafe(32)
    db.add(
        AuthSession(
            user_id=user.id,
            token_hash=_token_hash(token),
            device=(device or "")[:160] or None,
        )
    )
    await db.commit()
    return token


async def register(
    payload: RegisterRequest, device: str | None, db: AsyncSession
) -> tuple[User, str]:
    email = normalize_email(payload.email)
    password_hash = await asyncio.to_thread(hash_password, payload.password)
    user = User(
        name=payload.name.strip(),
        currency=payload.currency.upper(),
        email=email,
        password_hash=password_hash,
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise Conflict("Un compte existe déjà avec cet email") from None
    return user, await _open_session(user, device, db)


async def login(
    payload: LoginRequest, device: str | None, db: AsyncSession
) -> tuple[User, str]:
    user = (
        await db.execute(select(User).where(User.email == normalize_email(payload.email)))
    ).scalar_one_or_none()
    stored = user.password_hash if user and user.password_hash else _DUMMY_HASH
    valid = await asyncio.to_thread(verify_password, payload.password, stored)
    if not (user and user.password_hash and valid):
        raise Unauthorized("Email ou mot de passe incorrect")
    return user, await _open_session(user, device, db)


async def authenticate(token: str, db: AsyncSession) -> User | None:
    """Utilisateur propriétaire du jeton, ou None s'il est inconnu / révoqué."""
    session = (
        await db.execute(
            select(AuthSession).where(AuthSession.token_hash == _token_hash(token))
        )
    ).scalar_one_or_none()
    if session is None:
        return None
    now = datetime.now(timezone.utc)
    last = session.last_used_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    if now - last > _LAST_USED_REFRESH:
        session.last_used_at = now
        await db.commit()
    return await db.get(User, session.user_id)


async def logout(token: str, db: AsyncSession) -> None:
    await db.execute(
        delete(AuthSession).where(AuthSession.token_hash == _token_hash(token))
    )
    await db.commit()
