# ruff: noqa: F811  (fixtures importées de tests.test_auth)
"""Connexion via Firebase : vérification du jeton, création, rattachement par email prouvé."""

import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import select

from app.core.config import settings
from app.main import app
from app.models import User
from app.services import firebase_auth
from tests.test_auth import ME, _bearer, _signup, client, outbox  # noqa: F401  (fixtures)

PROJECT = settings.firebase_project_id
_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


class _StubCerts:
    async def get(self, kid: str):
        return _KEY.public_key() if kid == "k1" else None


@pytest.fixture(autouse=True)
def stub_certs(monkeypatch) -> None:
    monkeypatch.setattr(firebase_auth, "_certs", _StubCerts())


def _token(
    uid: str = "fb-awa",
    email: str = "awa@example.com",
    verified: bool = False,
    provider: str = "password",
    key=_KEY,
    **over,
) -> str:
    now = int(time.time())
    claims = {
        "iss": f"https://securetoken.google.com/{PROJECT}",
        "aud": PROJECT,
        "sub": uid,
        "iat": now,
        "auth_time": now,
        "exp": now + 3600,
        "email": email,
        "email_verified": verified,
        "name": "Awa Google",
        "firebase": {"sign_in_provider": provider},
        **over,
    }
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": "k1"})


async def _user_by_email(email: str) -> User:
    async with app.state.test_session_maker() as db:
        return (await db.execute(select(User).where(User.email == email))).scalar_one()


async def test_google_account_gets_a_session_immediately(client, outbox) -> None:
    res = await client.post(
        "/api/v1/auth/firebase", json={"id_token": _token(verified=True, provider="google.com")}
    )
    assert res.status_code == 200, res.text
    assert res.json()["user"]["name"] == "Awa Google"
    assert outbox == []
    me = await client.get("/api/v1/auth/me", headers=_bearer(res.json()["token"]))
    assert me.status_code == 200


async def test_password_account_confirms_email_once_with_the_code(client, outbox) -> None:
    body = {"id_token": _token(), "name": "Awa", "currency": "eur"}
    res = await client.post("/api/v1/auth/firebase", json=body)
    assert res.status_code == 202
    assert res.json() == {"email": "awa@example.com", "verification_required": True}

    res = await client.post(
        "/api/v1/auth/firebase/verify", json={"id_token": _token(), "code": outbox.code}
    )
    assert res.status_code == 200, res.text
    assert res.json()["user"]["currency"] == "EUR"

    sent = len(outbox)
    res = await client.post("/api/v1/auth/firebase", json={"id_token": _token()})
    assert res.status_code == 200
    assert len(outbox) == sent  # plus de code ensuite


async def test_existing_account_is_linked_only_after_the_code(client, outbox) -> None:
    legacy = await _signup(client, outbox)
    res = await client.post("/api/v1/auth/firebase", json={"id_token": _token()})
    assert res.status_code == 202
    assert (await _user_by_email("awa@example.com")).firebase_uid is None

    wrong = "000000" if outbox.code != "000000" else "111111"
    res = await client.post(
        "/api/v1/auth/firebase/verify", json={"id_token": _token(), "code": wrong}
    )
    assert res.status_code == 401
    assert (await _user_by_email("awa@example.com")).firebase_uid is None

    res = await client.post(
        "/api/v1/auth/firebase/verify", json={"id_token": _token(), "code": outbox.code}
    )
    assert res.status_code == 200
    assert res.json()["user"]["id"] == legacy["user"]["id"]  # mêmes données
    assert (await _user_by_email("awa@example.com")).firebase_uid == "fb-awa"


async def test_open_legacy_session_links_without_a_code(client, outbox) -> None:
    legacy = await _signup(client, outbox)
    sent = len(outbox)
    res = await client.post(
        "/api/v1/auth/firebase", json={"id_token": _token()}, headers=_bearer(legacy["token"])
    )
    assert res.status_code == 200, res.text
    assert res.json()["user"]["id"] == legacy["user"]["id"]
    assert len(outbox) == sent


async def test_legacy_session_of_another_user_does_not_link(client, outbox) -> None:
    other = await _signup(client, outbox, email="bob@example.com")
    await _signup(client, outbox)
    res = await client.post(
        "/api/v1/auth/firebase", json={"id_token": _token()}, headers=_bearer(other["token"])
    )
    assert res.status_code == 202


async def test_google_cannot_take_over_an_account_linked_elsewhere(client, outbox) -> None:
    await client.post(
        "/api/v1/auth/firebase", json={"id_token": _token(verified=True, provider="google.com")}
    )
    res = await client.post(
        "/api/v1/auth/firebase",
        json={"id_token": _token(uid="fb-intrus", verified=True, provider="google.com")},
    )
    assert res.status_code == 409


@pytest.mark.parametrize(
    "token",
    [
        _token(key=_OTHER_KEY),
        _token(aud="autre-projet"),
        _token(iss="https://securetoken.google.com/autre-projet"),
        _token(exp=int(time.time()) - 120),
        _token(sub=""),
        "pas-un-jwt-du-tout-xxxxxxxxxx",
    ],
)
async def test_invalid_tokens_are_rejected(client, outbox, token) -> None:
    res = await client.post("/api/v1/auth/firebase", json={"id_token": token})
    assert res.status_code == 401
