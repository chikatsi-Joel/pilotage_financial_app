"""Configuration générale stockée en base (table `app_settings`), modifiable depuis le backoffice.

Cache mémoire paresseux (`get`) : une clé est lue en base à sa première demande, puis servie
depuis la mémoire ; une modification depuis le backoffice l'invalide (`invalidate`) et elle est
relue à la demande suivante. Aucune lecture périodique. Une clé absente de la base retombe sur
la variable d'environnement du même nom (`settings`).

Un seul processus : avec plusieurs workers ou serveurs, il faudra diffuser l'invalidation
(ex. Redis pub/sub) pour que tous oublient la valeur modifiée.

Les secrets sont chiffrés avec Fernet ; la clé dérive de `SETTINGS_SECRET_KEY`.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import re
from urllib.parse import urlparse
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_session_factory
from app.db.upsert import upsert
from app.models import AppSetting
from app.services.errors import ServiceError

log = logging.getLogger(__name__)

KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]{1,79}$")


@dataclass(frozen=True)
class SettingSpec:
    key: str
    label: str
    description: str
    secret: bool
    multiline: bool = False


# Clés connues : affichées même si elles ne sont pas encore en base (valeur d'environnement).
CATALOG: tuple[SettingSpec, ...] = (
    SettingSpec("ollama_api_key", "Clé API Ollama", "Analyse IA et lecture des tickets.", True),
    SettingSpec("ollama_base_url", "URL Ollama", "Serveur Ollama (ollama.com ou auto-hébergé).", False),
    SettingSpec("ollama_model", "Modèle IA", "Modèle utilisé pour l'analyse financière.", False),
    SettingSpec("ollama_vision_model", "Modèle vision", "Lecture des tickets ; vide = modèle IA.", False),
    SettingSpec("expo_access_token", "Jeton Expo", "Envoi des notifications push (facultatif).", True),
    SettingSpec(
        "firebase_service_account",
        "Compte de service Firebase",
        "JSON du compte de service : nécessaire pour publier Remote Config depuis l'onglet Flags.",
        True,
        multiline=True,
    ),
)
SPECS = {s.key: s for s in CATALOG}

# Valeur en base par clé (None = absente ou illisible : on retombe sur le .env).
_cache: dict[str, str | None] = {}
# Compteur d'invalidations par clé : empêche une lecture concurrente de remettre une valeur périmée.
_generation: dict[str, int] = {}


class SettingsError(ServiceError):
    """Erreur métier renvoyée au backoffice (clé invalide, chiffrement indisponible)."""


def _fernet() -> Fernet:
    if not settings.settings_secret_key:
        raise SettingsError(
            "SETTINGS_SECRET_KEY manquante côté serveur : impossible de chiffrer ou lire un secret"
        )
    # Clé de 32 octets dérivée de la phrase : elle doit être longue et aléatoire
    # (ex. `python -c "import secrets; print(secrets.token_urlsafe(48))"`).
    digest = hashlib.sha256(settings.settings_secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _decrypt(value: str) -> str | None:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except (InvalidToken, SettingsError):
        return None


def _env_default(key: str) -> str:
    value: Any = getattr(settings, key, "")
    return "" if value is None else str(value)


def _check_base_url(value: str) -> None:
    parsed = urlparse(value)
    local = parsed.hostname in ("localhost", "127.0.0.1", "host.docker.internal", "ollama")
    if parsed.scheme not in ("https", "http") or not parsed.hostname:
        raise SettingsError("URL invalide")
    if parsed.scheme == "http" and not local:
        raise SettingsError("HTTPS obligatoire hors serveur local (la clé API y est envoyée)")


async def get(key: str) -> str:
    """Valeur effective : base de données, sinon variable d'environnement, sinon "".

    Cache paresseux : la clé n'est lue en base qu'à sa première demande, puis servie depuis la
    mémoire jusqu'à ce qu'une modification l'invalide. Aucune lecture tant que rien ne change.
    """
    if key in _cache:
        value = _cache[key]
    else:
        # Valeur lue rendue même si une invalidation concurrente empêche de la garder en cache.
        value = await _hydrate(key)
    return _env_default(key) if value is None else value


async def _hydrate(key: str) -> str | None:
    generation = _generation.get(key, 0)
    async with get_session_factory()() as db:
        row = (
            await db.execute(select(AppSetting.value, AppSetting.is_secret).where(AppSetting.key == key))
        ).first()
    value: str | None = None
    if row is not None:
        value = _decrypt(row.value) if row.is_secret else row.value
        if value is None:
            log.error("Secret %s illisible (SETTINGS_SECRET_KEY absente ou changée)", key)
    # Une invalidation survenue pendant la lecture rend cette valeur périmée : on ne la garde pas.
    if _generation.get(key, 0) == generation:
        _cache[key] = value
    return value


def invalidate(key: str) -> None:
    """Retire la clé du cache ; elle sera relue en base à la prochaine demande."""
    _generation[key] = _generation.get(key, 0) + 1
    _cache.pop(key, None)


def mask(value: str) -> str:
    if not value:
        return ""
    return "••••" + value[-4:] if len(value) > 8 else "••••"


async def list_settings(db: AsyncSession) -> list[dict[str, Any]]:
    """Clés connues + clés libres en base ; les secrets ne sortent que masqués."""
    rows = {r.key: r for r in (await db.execute(select(AppSetting))).scalars().all()}
    out: list[dict[str, Any]] = []
    keys = [s.key for s in CATALOG] + sorted(k for k in rows if k not in SPECS)
    for key in keys:
        spec = SPECS.get(key)
        row = rows.get(key)
        secret = spec.secret if spec else bool(row and row.is_secret)
        if row is not None:
            plain = _decrypt(row.value) if row.is_secret else row.value
            source = "database" if plain is not None else "unreadable"
            value = plain or ""
        else:
            value = _env_default(key) if spec else ""
            source = "environment" if value else "unset"
        out.append(
            {
                "key": key,
                "label": spec.label if spec else key,
                "description": spec.description if spec else "",
                "secret": secret,
                "multiline": bool(spec and spec.multiline),
                "known": spec is not None,
                "value": mask(value) if secret else value,
                "source": source,
                "updated_at": row.updated_at if row else None,
                "updated_by": row.updated_by if row else None,
            }
        )
    return out


async def set_value(
    db: AsyncSession, key: str, value: str, secret: bool | None, admin_email: str
) -> None:
    if not KEY_PATTERN.match(key):
        raise SettingsError("Clé invalide : minuscules, chiffres et _ uniquement")
    spec = SPECS.get(key)
    # Lecture de la seule colonne (pas d'objet ORM en cache de session qui masquerait l'upsert).
    was_secret = (
        await db.execute(select(AppSetting.is_secret).where(AppSetting.key == key))
    ).scalar_one_or_none()
    if spec:
        is_secret = spec.secret
    elif was_secret:
        # Un secret le reste : une modification ne peut pas le rétrograder en clair.
        if secret is False:
            raise SettingsError("Une clé secrète ne peut pas redevenir publique : supprimez-la d'abord")
        is_secret = True
    else:
        is_secret = bool(secret)
    value = value.strip()
    if not value:
        raise SettingsError("Valeur vide : supprimez la clé pour revenir à la valeur par défaut")
    if key == "firebase_service_account":
        from app.services.admin import remote_config

        remote_config.parse_service_account(value)  # refuse un JSON invalide tout de suite
    if key == "ollama_base_url":
        _check_base_url(value)
        # La clé API part en Bearer vers cette adresse : changement tracé dans les logs.
        log.warning("ollama_base_url modifiée par %s : %s", admin_email, value)
    stored = _fernet().encrypt(value.encode()).decode() if is_secret else value
    await upsert(
        db,
        AppSetting,
        [
            {
                "key": key,
                "value": stored,
                "is_secret": is_secret,
                "updated_by": admin_email,
                "updated_at": datetime.now(timezone.utc),
            }
        ],
        ["key"],
        ["value", "is_secret", "updated_by", "updated_at"],
    )
    await db.commit()
    invalidate(key)
    _on_change(key)


def _on_change(key: str) -> None:
    if key == "firebase_service_account":
        from app.services.admin import remote_config

        remote_config.forget_token()


async def delete_value(db: AsyncSession, key: str) -> None:
    await db.execute(delete(AppSetting).where(AppSetting.key == key))
    await db.commit()
    invalidate(key)
    _on_change(key)
