"""Authentification : inscription, connexion, session persistante, isolation des comptes."""

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.services import auth_service

ME = {"name": "Awa", "email": "Awa@Example.com", "password": "s3cret-pass"}


@pytest.fixture
async def client():
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
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        yield c
    app.dependency_overrides.clear()
    await engine.dispose()


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def _register(client: httpx.AsyncClient, **over) -> dict:
    res = await client.post("/api/v1/auth/register", json={**ME, **over})
    assert res.status_code == 201, res.text
    return res.json()


def test_password_hash_roundtrip() -> None:
    stored = auth_service.hash_password("abc12345")
    assert "abc12345" not in stored
    assert auth_service.verify_password("abc12345", stored)
    assert not auth_service.verify_password("wrong", stored)
    assert not auth_service.verify_password("abc12345", "garbage")


async def test_register_then_access_own_data(client) -> None:
    data = await _register(client)
    assert data["user"]["email"] == "awa@example.com"
    uid = data["user"]["id"]
    res = await client.get(f"/api/v1/users/{uid}", headers=_bearer(data["token"]))
    assert res.status_code == 200
    me = await client.get("/api/v1/auth/me", headers=_bearer(data["token"]))
    assert me.json()["id"] == uid


async def test_duplicate_email_is_conflict(client) -> None:
    await _register(client)
    res = await client.post("/api/v1/auth/register", json={**ME, "email": "awa@example.com"})
    assert res.status_code == 409


async def test_login_wrong_password_and_unknown_email(client) -> None:
    await _register(client)
    bad = await client.post("/api/v1/auth/login", json={"email": ME["email"], "password": "nope-nope"})
    unknown = await client.post("/api/v1/auth/login", json={"email": "x@y.zz", "password": "whatever1"})
    assert bad.status_code == unknown.status_code == 401
    assert bad.json() == unknown.json()


async def test_session_survives_and_second_device_is_independent(client) -> None:
    first = await _register(client)
    second = (
        await client.post("/api/v1/auth/login", json={"email": ME["email"], "password": ME["password"]})
    ).json()
    assert first["token"] != second["token"]
    uid = first["user"]["id"]

    out = await client.post("/api/v1/auth/logout", headers=_bearer(first["token"]))
    assert out.status_code == 204
    assert (await client.get(f"/api/v1/users/{uid}", headers=_bearer(first["token"]))).status_code == 401
    assert (await client.get(f"/api/v1/users/{uid}", headers=_bearer(second["token"]))).status_code == 200


async def test_requires_token_and_blocks_other_users(client) -> None:
    a = await _register(client)
    b = await _register(client, email="bob@example.com", name="Bob")
    url = f"/api/v1/users/{a['user']['id']}"
    assert (await client.get(url)).status_code == 401
    assert (await client.get(url, headers=_bearer("garbage"))).status_code == 401
    assert (await client.get(url, headers=_bearer(b["token"]))).status_code == 403
    cats = await client.get(f"{url}/categories", headers=_bearer(b["token"]))
    assert cats.status_code == 403


async def test_weak_password_rejected(client) -> None:
    res = await client.post("/api/v1/auth/register", json={**ME, "password": "short"})
    assert res.status_code == 422
