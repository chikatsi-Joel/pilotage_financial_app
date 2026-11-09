"""Authentification : inscription + code email, connexion, session persistante, isolation."""

import re
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import User
from app.services import auth_service, mailer

ME = {"name": "Awa", "email": "Awa@Example.com", "password": "s3cret-pass"}


class Outbox(list):
    """Emails « envoyés » ; `code` donne le dernier code à 6 chiffres."""

    @property
    def code(self) -> str:
        return re.search(r"\b(\d{6})\b", self[-1]["body"]).group(1)


@pytest.fixture
def outbox(monkeypatch) -> Outbox:
    box = Outbox()

    async def fake_send(to: str, subject: str, body: str) -> None:
        box.append({"to": to, "subject": subject, "body": body})

    monkeypatch.setattr(mailer, "send_email", fake_send)
    monkeypatch.setattr(auth_service, "RESEND_COOLDOWN", timedelta(0))
    return box


@pytest.fixture
async def client(outbox):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:", poolclass=StaticPool, connect_args={"check_same_thread": False}
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)

    async def override_db():
        async with maker() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    app.state.test_session_maker = maker
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        yield c
    app.dependency_overrides.clear()
    await engine.dispose()


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _signup(client, outbox, **over) -> dict:
    """Inscription complète : register puis verify avec le code reçu par email."""
    body = {**ME, **over}
    res = await client.post("/api/v1/auth/register", json=body)
    assert res.status_code == 202, res.text
    res = await client.post("/api/v1/auth/verify", json={"email": body["email"], "code": outbox.code})
    assert res.status_code == 200, res.text
    return res.json()


def test_password_hash_roundtrip() -> None:
    stored = auth_service.hash_password("abc12345")
    assert "abc12345" not in stored
    assert auth_service.verify_password("abc12345", stored)
    assert not auth_service.verify_password("wrong", stored)
    assert not auth_service.verify_password("abc12345", "garbage")


async def test_register_sends_code_and_opens_no_session(client, outbox) -> None:
    res = await client.post("/api/v1/auth/register", json=ME)
    assert res.status_code == 202
    assert "token" not in res.json()
    assert outbox[-1]["to"] == "awa@example.com"
    assert len(outbox.code) == 6


async def test_verify_opens_session_and_grants_access(client, outbox) -> None:
    data = await _signup(client, outbox)
    uid = data["user"]["id"]
    assert data["user"]["email"] == "awa@example.com"
    res = await client.get(f"/api/v1/users/{uid}", headers=_bearer(data["token"]))
    assert res.status_code == 200
    me = await client.get("/api/v1/auth/me", headers=_bearer(data["token"]))
    assert me.json()["id"] == uid


async def test_wrong_code_is_rejected_and_locks_after_five_attempts(client, outbox) -> None:
    await client.post("/api/v1/auth/register", json=ME)
    good = outbox.code
    wrong = "000000" if good != "000000" else "111111"
    for _ in range(5):
        res = await client.post("/api/v1/auth/verify", json={"email": ME["email"], "code": wrong})
        assert res.status_code == 401
    # Même le bon code est refusé : il faut en redemander un.
    res = await client.post("/api/v1/auth/verify", json={"email": ME["email"], "code": good})
    assert res.status_code == 401
    assert (await client.post("/api/v1/auth/resend", json={"email": ME["email"]})).status_code == 204
    res = await client.post("/api/v1/auth/verify", json={"email": ME["email"], "code": outbox.code})
    assert res.status_code == 200


async def test_expired_code_is_rejected(client, outbox) -> None:
    await client.post("/api/v1/auth/register", json=ME)
    async with app.state.test_session_maker() as db:
        user = (await db.execute(select(User))).scalar_one()
        user.email_code_expires_at = user.email_code_expires_at - timedelta(hours=1)
        await db.commit()
    res = await client.post("/api/v1/auth/verify", json={"email": ME["email"], "code": outbox.code})
    assert res.status_code == 401


async def test_resend_respects_cooldown(client, outbox, monkeypatch) -> None:
    monkeypatch.setattr(auth_service, "RESEND_COOLDOWN", timedelta(minutes=1))
    await client.post("/api/v1/auth/register", json=ME)
    res = await client.post("/api/v1/auth/resend", json={"email": ME["email"]})
    assert res.status_code == 429
    unknown = await client.post("/api/v1/auth/resend", json={"email": "nobody@x.io"})
    assert unknown.status_code == 204


async def test_login_blocked_until_email_verified(client, outbox) -> None:
    await client.post("/api/v1/auth/register", json=ME)
    sent = len(outbox)
    res = await client.post(
        "/api/v1/auth/login", json={"email": ME["email"], "password": ME["password"]}
    )
    assert res.status_code == 403
    assert len(outbox) == sent + 1  # un nouveau code est envoyé
    verified = await client.post("/api/v1/auth/verify", json={"email": ME["email"], "code": outbox.code})
    assert verified.status_code == 200


async def test_unverified_signup_can_be_retaken_but_verified_one_cannot(client, outbox) -> None:
    await client.post("/api/v1/auth/register", json=ME)
    again = await client.post("/api/v1/auth/register", json={**ME, "name": "Autre"})
    assert again.status_code == 202
    await client.post("/api/v1/auth/verify", json={"email": ME["email"], "code": outbox.code})
    taken = await client.post("/api/v1/auth/register", json=ME)
    assert taken.status_code == 409


async def test_login_wrong_password_and_unknown_email(client, outbox) -> None:
    await _signup(client, outbox)
    bad = await client.post("/api/v1/auth/login", json={"email": ME["email"], "password": "nope-nope"})
    unknown = await client.post("/api/v1/auth/login", json={"email": "x@y.zz", "password": "whatever1"})
    assert bad.status_code == unknown.status_code == 401
    assert bad.json() == unknown.json()


async def test_session_survives_and_second_device_is_independent(client, outbox) -> None:
    first = await _signup(client, outbox)
    second = (
        await client.post("/api/v1/auth/login", json={"email": ME["email"], "password": ME["password"]})
    ).json()
    assert first["token"] != second["token"]
    uid = first["user"]["id"]

    out = await client.post("/api/v1/auth/logout", headers=_bearer(first["token"]))
    assert out.status_code == 204
    assert (await client.get(f"/api/v1/users/{uid}", headers=_bearer(first["token"]))).status_code == 401
    assert (await client.get(f"/api/v1/users/{uid}", headers=_bearer(second["token"]))).status_code == 200


async def test_requires_token_and_blocks_other_users(client, outbox) -> None:
    a = await _signup(client, outbox)
    b = await _signup(client, outbox, email="bob@example.com", name="Bob")
    url = f"/api/v1/users/{a['user']['id']}"
    assert (await client.get(url)).status_code == 401
    assert (await client.get(url, headers=_bearer("garbage"))).status_code == 401
    assert (await client.get(url, headers=_bearer(b["token"]))).status_code == 403
    cats = await client.get(f"{url}/categories", headers=_bearer(b["token"]))
    assert cats.status_code == 403


async def test_weak_password_rejected(client) -> None:
    res = await client.post("/api/v1/auth/register", json={**ME, "password": "short"})
    assert res.status_code == 422
