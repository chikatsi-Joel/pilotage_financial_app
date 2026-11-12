"""Vérification des jetons d'identité Firebase Authentication (ID tokens).

Le jeton est un JWT RS256 signé par Google. On le vérifie localement avec les
certificats publics de `securetoken@system.gserviceaccount.com` (mis en cache selon
leur `Cache-Control`) : aucune clé secrète n'est nécessaire, seulement l'identifiant
du projet Firebase, qui fixe l'audience et l'émetteur attendus.
"""

from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass

import httpx
import jwt
from cryptography.x509 import load_pem_x509_certificate

from app.core.config import settings
from app.services.errors import Unauthorized

_INVALID = "Jeton Firebase invalide ou expiré"
_DEFAULT_MAX_AGE = 3600


@dataclass(frozen=True, slots=True)
class FirebaseIdentity:
    uid: str
    email: str | None
    email_verified: bool
    name: str | None
    provider: str  # "password", "google.com", …


class _CertCache:
    """Clés publiques par `kid`, rafraîchies à l'expiration annoncée par Google."""

    def __init__(self) -> None:
        self._keys: dict[str, object] = {}
        self._expires_at = 0.0
        self._lock = asyncio.Lock()

    async def get(self, kid: str) -> object | None:
        if time.monotonic() >= self._expires_at or kid not in self._keys:
            async with self._lock:
                if time.monotonic() >= self._expires_at or kid not in self._keys:
                    await self._refresh()
        return self._keys.get(kid)

    async def _refresh(self) -> None:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                res = await client.get(settings.firebase_certs_url)
                res.raise_for_status()
        except httpx.HTTPError as exc:
            raise Unauthorized("Vérification Firebase indisponible, réessayez") from exc
        self._keys = {
            kid: load_pem_x509_certificate(pem.encode()).public_key()
            for kid, pem in res.json().items()
        }
        match = re.search(r"max-age=(\d+)", res.headers.get("cache-control", ""))
        self._expires_at = time.monotonic() + (int(match.group(1)) if match else _DEFAULT_MAX_AGE)


_certs = _CertCache()


async def verify_id_token(token: str) -> FirebaseIdentity:
    """Identité portée par un ID token Firebase valide ; lève `Unauthorized` sinon."""
    project = settings.firebase_project_id
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        raise Unauthorized(_INVALID) from None
    if header.get("alg") != "RS256" or not header.get("kid"):
        raise Unauthorized(_INVALID)
    key = await _certs.get(header["kid"])
    if key is None:
        raise Unauthorized(_INVALID)
    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=project,
            issuer=f"https://securetoken.google.com/{project}",
            leeway=30,
            options={"require": ["exp", "iat", "sub", "aud", "iss"]},
        )
    except jwt.PyJWTError:
        raise Unauthorized(_INVALID) from None

    uid = claims.get("sub")
    if not isinstance(uid, str) or not uid or len(uid) > 128:
        raise Unauthorized(_INVALID)
    if claims.get("auth_time", 0) > time.time() + 30:
        raise Unauthorized(_INVALID)
    email = claims.get("email")
    return FirebaseIdentity(
        uid=uid,
        email=email.strip().lower() if isinstance(email, str) and email.strip() else None,
        email_verified=bool(claims.get("email_verified")),
        name=claims.get("name") if isinstance(claims.get("name"), str) else None,
        provider=str((claims.get("firebase") or {}).get("sign_in_provider", "")),
    )
