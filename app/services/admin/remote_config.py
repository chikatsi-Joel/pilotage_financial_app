"""Onglet Flags : lecture et publication du modèle Firebase Remote Config (API REST v1).

Authentification par compte de service (JSON enregistré, chiffré, dans app_settings sous
`firebase_service_account`) : jeton OAuth obtenu par assertion JWT signée (RS256), mis en cache
jusqu'à son expiration. Aucune dépendance au SDK firebase-admin.

Une modification ne touche que la valeur par défaut d'un paramètre : conditions, rollouts et
valeurs conditionnelles sont renvoyés tels quels, et l'ETag (If-Match) empêche d'écraser une
publication faite entre-temps depuis la console.
"""

from __future__ import annotations

import hashlib
import json
import math
import time
from typing import Any

import httpx
import jwt

from app.core.config import settings
from app.services import settings_store
from app.services.errors import Conflict, ServiceError

SCOPE = "https://www.googleapis.com/auth/firebase.remoteconfig"
API = "https://firebaseremoteconfig.googleapis.com/v1/projects/{project}/remoteConfig"
VALUE_TYPES = ("STRING", "BOOLEAN", "NUMBER", "JSON")
TIMEOUT = 15.0

# (empreinte du compte de service, jeton, expiration monotone) : un autre compte = nouveau jeton.
_token: tuple[str, str, float] | None = None


class RemoteConfigError(ServiceError):
    status_code = 502


class RemoteConfigNotConfigured(ServiceError):
    status_code = 409


class InvalidFlag(ServiceError):
    status_code = 400


def parse_service_account(raw: str) -> dict[str, str]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise InvalidFlag("Compte de service : JSON invalide") from exc
    required = ("client_email", "private_key", "token_uri")
    if not isinstance(data, dict) or any(not data.get(k) for k in required):
        raise InvalidFlag("Compte de service : client_email, private_key et token_uri sont requis")
    return data


async def _account() -> dict[str, str]:
    raw = await settings_store.get("firebase_service_account")
    if not raw:
        raise RemoteConfigNotConfigured(
            "Ajoutez le compte de service Firebase dans Configuration pour gérer les flags"
        )
    return parse_service_account(raw)


def forget_token() -> None:
    """Appelé quand le compte de service change ou est supprimé."""
    global _token
    _token = None


def _error_detail(response: httpx.Response) -> str:
    try:
        return str(response.json().get("error", {}).get("message", ""))
    except (ValueError, AttributeError):
        return ""


async def _access_token(client: httpx.AsyncClient) -> str:
    global _token
    account = await _account()
    fingerprint = hashlib.sha256(
        (account["client_email"] + account["private_key"]).encode()
    ).hexdigest()
    if _token and _token[0] == fingerprint and _token[2] - 60 > time.monotonic():
        return _token[1]
    now = int(time.time())
    assertion = jwt.encode(
        {
            "iss": account["client_email"],
            "scope": SCOPE,
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
        raise RemoteConfigError(f"Connexion Google refusée ({response.status_code})")
    try:
        body = response.json()
        access = str(body["access_token"])
    except (ValueError, KeyError, TypeError) as exc:
        raise RemoteConfigError("Réponse inattendue du serveur d'authentification Google") from exc
    _token = (fingerprint, access, time.monotonic() + int(body.get("expires_in", 3600)))
    return access


async def _project() -> str:
    account = await _account()
    return account.get("project_id") or settings.firebase_project_id


async def _get_template(client: httpx.AsyncClient) -> tuple[dict[str, Any], str]:
    token = await _access_token(client)
    response = await client.get(
        API.format(project=await _project()),
        headers={"Authorization": f"Bearer {token}", "Accept-Encoding": "gzip"},
    )
    if response.status_code != 200:
        detail = _error_detail(response)
        raise RemoteConfigError(f"Lecture de Remote Config impossible ({response.status_code}) {detail}".strip())
    etag = response.headers.get("etag")
    if not etag:
        # Sans ETag, la publication écraserait sans contrôle une modification concurrente.
        raise RemoteConfigError("Remote Config n'a pas renvoyé d'ETag : publication annulée")
    return response.json(), etag


def _all_parameters(template: dict[str, Any]) -> dict[str, tuple[dict[str, Any], str | None]]:
    """Paramètres à plat, avec leur groupe éventuel."""
    out: dict[str, tuple[dict[str, Any], str | None]] = {
        k: (v, None) for k, v in template.get("parameters", {}).items()
    }
    for group_name, group in template.get("parameterGroups", {}).items():
        for k, v in group.get("parameters", {}).items():
            out[k] = (v, group_name)
    return out


def _conditional_summary(param: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for condition, value in param.get("conditionalValues", {}).items():
        if "rolloutValue" in value:
            out.append({"condition": condition, "value": value["rolloutValue"].get("value"), "rollout": True})
        else:
            out.append(
                {
                    "condition": condition,
                    "value": value.get("value"),
                    "in_app_default": bool(value.get("useInAppDefault")),
                    "rollout": False,
                }
            )
    return out


def _summary(template: dict[str, Any], project: str) -> dict[str, Any]:
    params = []
    for key, (param, group) in sorted(_all_parameters(template).items()):
        default = param.get("defaultValue", {})
        params.append(
            {
                "key": key,
                "group": group,
                "value_type": param.get("valueType", "STRING"),
                "description": param.get("description", ""),
                "value": default.get("value"),
                "in_app_default": bool(default.get("useInAppDefault")),
                "conditional": _conditional_summary(param),
            }
        )
    version = template.get("version", {})
    return {
        "project": project,
        "version": version.get("versionNumber"),
        "updated_at": version.get("updateTime"),
        "updated_by": (version.get("updateUser") or {}).get("email"),
        "conditions": [
            {"name": c.get("name"), "expression": c.get("expression")}
            for c in template.get("conditions", [])
        ],
        "parameters": params,
    }


def _check_value(value_type: str, value: str) -> None:
    if value_type == "PARAMETER_VALUE_TYPE_UNSPECIFIED":
        return  # paramètre ancien sans type : texte libre
    if value_type not in VALUE_TYPES:
        raise InvalidFlag("Type inconnu")
    if value_type == "BOOLEAN" and value not in ("true", "false"):
        raise InvalidFlag("Un booléen vaut true ou false")
    if value_type == "NUMBER":
        try:
            number = float(value)
        except ValueError as exc:
            raise InvalidFlag("Valeur numérique attendue") from exc
        if not math.isfinite(number):
            raise InvalidFlag("Valeur numérique finie attendue")
    if value_type == "JSON":
        if not value.strip():
            raise InvalidFlag("Un paramètre JSON ne peut pas être vide")
        try:
            json.loads(value)
        except json.JSONDecodeError as exc:
            raise InvalidFlag("JSON invalide") from exc


async def get_flags() -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        template, _ = await _get_template(client)
    return _summary(template, await _project())


async def set_flag(
    key: str,
    value: str,
    value_type: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    """Change la valeur par défaut d'un paramètre (ou le crée) et publie le modèle."""
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        template, etag = await _get_template(client)
        existing = _all_parameters(template).get(key)
        if existing is None:
            if not value_type:
                raise InvalidFlag("Type requis pour un nouveau paramètre")
            param: dict[str, Any] = {"valueType": value_type}
            template.setdefault("parameters", {})[key] = param
        else:
            param = existing[0]
        kind = param.get("valueType", "STRING")
        _check_value(kind, value)
        param["defaultValue"] = {"value": value}
        if description is not None:
            if len(description) > 256:
                raise InvalidFlag("Description limitée à 256 caractères")
            param["description"] = description
        template.pop("version", None)
        token = await _access_token(client)
        response = await client.put(
            API.format(project=await _project()),
            content=json.dumps(template, ensure_ascii=False).encode(),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json; charset=UTF-8",
                "If-Match": etag,
            },
        )
    if response.status_code == 412:
        raise Conflict("Remote Config a été modifié entre-temps : rechargez la page")
    if response.status_code != 200:
        detail = _error_detail(response)
        raise RemoteConfigError(f"Publication refusée ({response.status_code}) {detail}".strip())
    return _summary(response.json(), await _project())
