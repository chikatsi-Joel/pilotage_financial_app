"""Jetons OAuth Google à partir d'un compte de service (assertion JWT RS256), sans SDK.

Partagé par Remote Config (backoffice) et la suppression des comptes Firebase. Un jeton est
mis en cache par (empreinte du compte de service, scope) jusqu'à son expiration : changer de
compte de service ou de scope en demande un nouveau.
"""

from __future__ import annotations

import hashlib
import time

import httpx
import jwt

from app.services.errors import ServiceError

# (empreinte, scope) -> (jeton, expiration monotone)
_tokens: dict[tuple[str, str], tuple[str, float]] = {}


class GoogleAuthError(ServiceError):
    status_code = 502


def forget() -> None:
    """Oublie tous les jetons (compte de service modifié ou supprimé)."""
    _tokens.clear()


async def access_token(client: httpx.AsyncClient, account: dict[str, str], scope: str) -> str:
    """Jeton d'accès pour `scope` ; `account` = JSON du compte de service déjà validé."""
    fingerprint = hashlib.sha256(
        (account["client_email"] + account["private_key"]).encode()
    ).hexdigest()
    cached = _tokens.get((fingerprint, scope))
    if cached and cached[1] - 60 > time.monotonic():
        return cached[0]
    now = int(time.time())
    assertion = jwt.encode(
        {
            "iss": account["client_email"],
            "scope": scope,
            "aud": account["token_uri"],
            "iat": now,
            "exp": now + 3600,
        },
        account["private_key"],
        algorithm="RS256",
    )
    response = await client.post(
        account["token_uri"],
        data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion},
    )
    if response.status_code != 200:
        raise GoogleAuthError(f"Connexion Google refusée ({response.status_code})")
    try:
        body = response.json()
        token = str(body["access_token"])
    except (ValueError, KeyError, TypeError) as exc:
        raise GoogleAuthError("Réponse inattendue du serveur d'authentification Google") from exc
    _tokens[(fingerprint, scope)] = (token, time.monotonic() + int(body.get("expires_in", 3600)))
    return token
