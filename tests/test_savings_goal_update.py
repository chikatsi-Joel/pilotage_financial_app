"""Modification d'un objectif d'épargne (cible, échéance) via PATCH."""

from datetime import date
from decimal import Decimal

import httpx
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import SavingsContribution, SavingsGoal, User
from app.services import auth_service


async def test_patch_changes_target_and_deadline_only_for_the_owner() -> None:
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
    try:
        async with maker() as db:
            owner = User(name="Awa", currency="XAF", email="a@b.cc", password_hash="x")
            other = User(name="Bob", currency="XAF", email="b@b.cc", password_hash="x")
            db.add_all([owner, other])
            await db.flush()
            goal = SavingsGoal(user_id=owner.id, name="Voyage", target_amount=Decimal("1200"),
                               deadline=date(2026, 12, 31))
            db.add(goal)
            await db.flush()
            db.add(SavingsContribution(savings_goal_id=goal.id, amount=Decimal("100")))
            await db.commit()
            uid, oid, gid = owner.id, other.id, goal.id
            token = await auth_service._open_session(owner, None, db)
        h = {"Authorization": f"Bearer {token}"}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            url = f"/api/v1/users/{uid}/savings-goals/{gid}"
            r = await c.patch(url, json={"target_amount": 1500, "deadline": "2027-06-30"}, headers=h)
            assert r.status_code == 200
            body = r.json()
            assert body["target_amount"] == 1500 and body["deadline"] == "2027-06-30"
            assert body["name"] == "Voyage" and body["current_amount"] == 100
            assert len(body["contributions"]) == 1

            assert (await c.patch(url, json={"target_amount": 0}, headers=h)).status_code == 422
            assert (await c.patch(url, json={"target_amount": 1e17}, headers=h)).status_code == 422
            assert (await c.patch(url, json={"target_amount": "12.345"}, headers=h)).status_code == 422
            assert (await c.patch(url, json={"deadline": "pas une date"}, headers=h)).status_code == 422
            missing = f"/api/v1/users/{uid}/savings-goals/00000000-0000-0000-0000-000000000000"
            assert (await c.patch(missing, json={"target_amount": 10}, headers=h)).status_code == 404
            foreign = f"/api/v1/users/{oid}/savings-goals/{gid}"
            assert (await c.patch(foreign, json={"target_amount": 10}, headers=h)).status_code in (401, 403, 404)
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
