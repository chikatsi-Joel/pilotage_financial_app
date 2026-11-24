"""Devise d'affichage modifiable par l'utilisateur (aucune conversion des montants)."""

from app.api.deps import DbSession, get_current_user
from app.main import app
from app.models import User
from tests.test_query_optimizations import client, env  # noqa: F401


async def test_user_changes_currency(env, client) -> None:  # noqa: F811
    _, maker, _ = env
    async with maker() as db:
        user = User(name="D", currency="XAF", email="d@x.io", password_hash="x")
        db.add(user)
        await db.commit()
    uid = user.id

    async def current(db: DbSession) -> User:  # même session que la route, comme en vrai
        return await db.get(User, uid)

    app.dependency_overrides[get_current_user] = current
    url = f"/api/v1/users/{user.id}"
    async with client as c:
        r = await c.patch(url, json={"currency": "eur"})
        assert r.status_code == 200 and r.json()["currency"] == "EUR"
        assert (await c.patch(url, json={"currency": "EURO"})).status_code == 422
        assert (await c.patch(url, json={"currency": "€$1"})).status_code == 422
        assert (await c.get(url)).json()["currency"] == "EUR"
