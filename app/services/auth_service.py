"""Authentification : comptes email + mot de passe, email vérifié par code (OTP),
sessions d'appareil sans expiration.

Le jeton de session est une valeur aléatoire opaque ; seule son empreinte
SHA-256 est stockée. La session reste valide jusqu'à la déconnexion explicite
(`logout`), comme une session WhatsApp. Aucune session n'est ouverte avant que
l'email ait été confirmé avec le code reçu.
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
from app.schemas.common import (
    FirebaseSignInRequest,
    LoginRequest,
    RegisterRequest,
    ResendRequest,
    VerifyRequest,
)
from app.services import mailer
from app.services.firebase_auth import FirebaseIdentity
from app.services.errors import Conflict, EmailDeliveryError, EmailNotVerified, TooManyRequests, Unauthorized

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**14, 8, 1
_LAST_USED_REFRESH = timedelta(hours=1)

CODE_TTL = timedelta(minutes=10)
CODE_MAX_ATTEMPTS = 5
RESEND_COOLDOWN = timedelta(seconds=60)
_INVALID_CODE = "Code invalide ou expiré"


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


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _aware(moment: datetime) -> datetime:
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def _code_hash(user: User, code: str) -> str:
    return _sha256(f"{user.id}:{code}")


async def _find_by_email(email: str, db: AsyncSession) -> User | None:
    return (
        await db.execute(select(User).where(User.email == normalize_email(email)))
    ).scalar_one_or_none()


async def _send_code(user: User, db: AsyncSession) -> None:
    """Génère un nouveau code, le stocke (haché) puis l'envoie par email."""
    code = f"{secrets.randbelow(10**6):06d}"
    now = datetime.now(timezone.utc)
    user.email_code_hash = _code_hash(user, code)
    user.email_code_expires_at = now + CODE_TTL
    user.email_code_attempts = 0
    user.email_code_sent_at = now
    await db.commit()
    try:
        await _deliver_code(user, code)
    except EmailDeliveryError:
        # Rien n'est parti : on libère le délai d'attente pour permettre de réessayer tout de suite.
        user.email_code_sent_at = None
        await db.commit()
        raise


async def _deliver_code(user: User, code: str) -> None:
    await mailer.send_email(
        user.email or "",
        "Votre code de vérification Lucia",
        f"Bonjour {user.name},\n\nVotre code de vérification est : {code}\n\n"
        f"Il est valable {int(CODE_TTL.total_seconds() // 60)} minutes. "
        "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n",
    )


async def _open_session(user: User, device: str | None, db: AsyncSession) -> str:
    token = secrets.token_urlsafe(32)
    db.add(
        AuthSession(
            user_id=user.id,
            token_hash=_sha256(token),
            device=(device or "")[:160] or None,
        )
    )
    await db.commit()
    return token


async def register(payload: RegisterRequest, db: AsyncSession) -> User:
    """Crée le compte (non vérifié) et envoie le code. Aucune session n'est ouverte."""
    email = normalize_email(payload.email)
    password_hash = await asyncio.to_thread(hash_password, payload.password)

    existing = await _find_by_email(email, db)
    if existing is not None and existing.email_verified_at is not None:
        raise Conflict("Un compte existe déjà avec cet email")
    if existing is not None:
        # Inscription jamais confirmée : personne n'en est propriétaire, on la reprend.
        _wait_cooldown(existing)
        existing.name = payload.name.strip()
        existing.currency = payload.currency.upper()
        existing.password_hash = password_hash
        user = existing
    else:
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
    await _send_code(user, db)
    return user


def _wait_cooldown(user: User) -> None:
    if user.email_code_sent_at and datetime.now(timezone.utc) - _aware(user.email_code_sent_at) < RESEND_COOLDOWN:
        raise TooManyRequests("Un code vient d'être envoyé, patientez une minute avant d'en redemander un")


async def _consume_code(user: User | None, code: str, db: AsyncSession) -> User:
    """Valide le code reçu par email (5 essais, 10 minutes) et marque l'email vérifié."""
    if (
        user is None
        or not user.email_code_hash
        or not user.email_code_expires_at
        or user.email_code_attempts >= CODE_MAX_ATTEMPTS
        or _aware(user.email_code_expires_at) < datetime.now(timezone.utc)
    ):
        raise Unauthorized(_INVALID_CODE)
    if not hmac.compare_digest(user.email_code_hash, _code_hash(user, code)):
        user.email_code_attempts += 1
        await db.commit()
        raise Unauthorized(_INVALID_CODE)

    user.email_verified_at = datetime.now(timezone.utc)
    user.email_code_hash = None
    user.email_code_expires_at = None
    user.email_code_attempts = 0
    return user


async def verify_email(
    payload: VerifyRequest, device: str | None, db: AsyncSession
) -> tuple[User, str]:
    user = await _consume_code(await _find_by_email(payload.email, db), payload.code, db)
    return user, await _open_session(user, device, db)


async def resend_code(payload: ResendRequest, db: AsyncSession) -> None:
    """Renvoie un code ; ne révèle jamais si l'email existe."""
    user = await _find_by_email(payload.email, db)
    if user is None or user.email_verified_at is not None:
        return
    _wait_cooldown(user)
    await _send_code(user, db)


async def login(
    payload: LoginRequest, device: str | None, db: AsyncSession
) -> tuple[User, str]:
    user = await _find_by_email(payload.email, db)
    stored = user.password_hash if user and user.password_hash else _DUMMY_HASH
    valid = await asyncio.to_thread(verify_password, payload.password, stored)
    if not (user and user.password_hash and valid):
        raise Unauthorized("Email ou mot de passe incorrect")
    if user.email_verified_at is None:
        try:
            _wait_cooldown(user)
            await _send_code(user, db)
        except TooManyRequests:
            pass  # un code récent est déjà dans sa boîte
        raise EmailNotVerified("Email non vérifié : un code vous a été envoyé")
    return user, await _open_session(user, device, db)


# ── Firebase Authentication ──────────────────────────────────────────────
#
# L'app se connecte via Firebase puis échange l'ID token contre une session Lucia.
# Rattachement par email : un compte Lucia existant n'est relié au compte Firebase
# que si l'email est prouvé, soit par Firebase (Google : email_verified), soit par
# une session Lucia déjà ouverte sur ce compte (migration depuis l'ancienne
# connexion), soit par le code à 6 chiffres envoyé par email.


async def _find_by_firebase_uid(uid: str, db: AsyncSession) -> User | None:
    return (await db.execute(select(User).where(User.firebase_uid == uid))).scalar_one_or_none()


async def _send_code_unless_recent(user: User, db: AsyncSession) -> None:
    try:
        _wait_cooldown(user)
    except TooManyRequests:
        return  # un code récent est déjà dans sa boîte
    await _send_code(user, db)


def _require_email(identity: FirebaseIdentity) -> str:
    if not identity.email:
        raise Unauthorized("Ce compte Firebase n'a pas d'adresse email")
    return identity.email


async def firebase_sign_in(
    identity: FirebaseIdentity,
    profile: FirebaseSignInRequest,
    device: str | None,
    current: User | None,
    db: AsyncSession,
) -> tuple[User, str | None]:
    """Session Lucia pour cette identité Firebase, ou None si le code email est requis."""
    email = _require_email(identity)
    now = datetime.now(timezone.utc)

    linked = await _find_by_firebase_uid(identity.uid, db)
    if linked is not None:
        if linked.email_verified_at is None:
            if not identity.email_verified:
                await _send_code_unless_recent(linked, db)
                return linked, None
            linked.email_verified_at = now
        return linked, await _open_session(linked, device, db)

    existing = await _find_by_email(email, db)
    if existing is not None:
        if existing.firebase_uid and existing.email_verified_at is not None:
            raise Conflict("Cet email est déjà rattaché à un autre compte")
        proven = identity.email_verified or (current is not None and current.id == existing.id)
        if not proven:
            # Le compte n'est relié qu'après le code (voir firebase_verify).
            await _send_code_unless_recent(existing, db)
            return existing, None
        existing.firebase_uid = identity.uid
        existing.email_verified_at = existing.email_verified_at or now
        return existing, await _open_session(existing, device, db)

    user = User(
        name=(profile.name or identity.name or email.split("@")[0]).strip()[:160],
        currency=(profile.currency or "XAF").upper(),
        email=email,
        firebase_uid=identity.uid,
        email_verified_at=now if identity.email_verified else None,
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise Conflict("Un compte existe déjà avec cet email") from None
    if user.email_verified_at is None:
        await _send_code(user, db)
        return user, None
    return user, await _open_session(user, device, db)


async def _pending_firebase_user(identity: FirebaseIdentity, db: AsyncSession) -> User | None:
    return await _find_by_firebase_uid(identity.uid, db) or await _find_by_email(
        _require_email(identity), db
    )


async def firebase_verify(
    identity: FirebaseIdentity, code: str, device: str | None, db: AsyncSession
) -> tuple[User, str]:
    """Code email confirmé : relie le compte Firebase puis ouvre la session."""
    user = await _pending_firebase_user(identity, db)
    if user is not None and user.firebase_uid not in (None, identity.uid):
        raise Unauthorized(_INVALID_CODE)
    user = await _consume_code(user, code, db)
    user.firebase_uid = identity.uid
    return user, await _open_session(user, device, db)


async def firebase_resend(identity: FirebaseIdentity, db: AsyncSession) -> None:
    """Renvoie le code d'un compte en attente ; rien si le compte est déjà relié et vérifié."""
    user = await _pending_firebase_user(identity, db)
    if user is None or (user.firebase_uid == identity.uid and user.email_verified_at is not None):
        return
    _wait_cooldown(user)
    await _send_code(user, db)


async def authenticate(token: str, db: AsyncSession) -> User | None:
    """Utilisateur propriétaire du jeton, ou None s'il est inconnu / révoqué."""
    session = (
        await db.execute(select(AuthSession).where(AuthSession.token_hash == _sha256(token)))
    ).scalar_one_or_none()
    if session is None:
        return None
    now = datetime.now(timezone.utc)
    if now - _aware(session.last_used_at) > _LAST_USED_REFRESH:
        session.last_used_at = now
        await db.commit()
    return await db.get(User, session.user_id)


async def logout(token: str, db: AsyncSession) -> None:
    await db.execute(delete(AuthSession).where(AuthSession.token_hash == _sha256(token)))
    await db.commit()
