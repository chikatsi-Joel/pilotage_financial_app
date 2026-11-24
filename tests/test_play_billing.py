"""Abonnement Premium Google Play : seul ce que Google renvoie active le premium, un achat
n'est rattaché qu'à un compte, et le premium n'est jamais raccourci."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import func, select

from app.models import PlaySubscription, User
from app.services import play_billing
from app.services.errors import Conflict, Forbidden
from tests.test_query_optimizations import env  # noqa: F401

NOW = datetime(2026, 11, 23, 12, tzinfo=UTC)
EXPIRY = "2026-12-23T12:00:00.123456789Z"


def _google(user_id, *, state="SUBSCRIPTION_STATE_ACTIVE", product="lucia_premium",
            expiry=EXPIRY, ack="ACKNOWLEDGEMENT_STATE_PENDING", tag=None) -> dict:
    return {
        "subscriptionState": state,
        "acknowledgementState": ack,
        "externalAccountIdentifiers": {
            "obfuscatedExternalAccountId": tag or play_billing.account_tag(user_id)
        },
        "lineItems": [
            {
                "productId": product,
                "expiryTime": expiry,
                "autoRenewingPlan": {"autoRenewEnabled": True},
                "offerDetails": {"basePlanId": "mensuel"},
            }
        ],
    }


class FakeGoogle:
    def __init__(self) -> None:
        self.body: dict = {}
        self.status = 200
        self.acks: list[str] = []
        self.reads = 0

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.method == "POST":
            self.acks.append(request.url.path)
            return httpx.Response(200, json={})
        self.reads += 1
        return httpx.Response(self.status, json=self.body)


@pytest.fixture
def google(monkeypatch):
    fake = FakeGoogle()

    async def base(client):
        return "https://play.test/apps/pkg", {}

    monkeypatch.setattr(play_billing, "_base", base)
    return fake


async def _user(db, email="p@x.io", premium_until=None) -> User:
    user = User(name="P", currency="XAF", email=email, password_hash="x",
                premium_until=premium_until)
    db.add(user)
    await db.commit()
    return user


def _client(fake: FakeGoogle) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(fake.handler))


def test_parse_subscription_reads_expiry_plan_and_flags() -> None:
    body = _google("u") | {"testPurchase": {}}
    p = play_billing.parse_subscription(body)
    assert p.expires_at == datetime(2026, 12, 23, 12, 0, 0, 123456, tzinfo=UTC)
    assert (p.product_id, p.base_plan_id, p.auto_renewing) == ("lucia_premium", "mensuel", True)
    assert p.entitled and p.test_purchase and not p.acknowledged


@pytest.mark.parametrize(
    ("state", "entitled"),
    [
        ("SUBSCRIPTION_STATE_ACTIVE", True),
        ("SUBSCRIPTION_STATE_IN_GRACE_PERIOD", True),
        ("SUBSCRIPTION_STATE_CANCELED", True),  # période payée encore due
        ("SUBSCRIPTION_STATE_ON_HOLD", False),
        ("SUBSCRIPTION_STATE_EXPIRED", False),
        ("SUBSCRIPTION_STATE_PENDING", False),
    ],
)
def test_entitlement_by_state(state: str, entitled: bool) -> None:
    assert play_billing.parse_subscription(_google("u", state=state)).entitled is entitled


async def test_verify_activates_premium_and_acknowledges(env, google) -> None:  # noqa: F811
    _, maker, _ = env
    async with maker() as db, _client(google) as client:
        user = await _user(db)
        google.body = _google(user.id)
        await play_billing.verify(user.id, "tok-1", db, client=client, now=NOW)
        await db.refresh(user)
        assert play_billing.as_utc(user.premium_until) == datetime(
            2026, 12, 23, 12, 0, 0, 123456, tzinfo=UTC
        )
        assert len(google.acks) == 1
        assert google.acks[0].endswith("lucia_premium/tokens/tok-1:acknowledge")
        # Même achat renvoyé (relance de l'app) : pas de doublon ni de seconde confirmation.
        google.body = _google(user.id, ack="ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED")
        await play_billing.verify(user.id, "tok-1", db, client=client, now=NOW)
        count = (await db.execute(select(func.count()).select_from(PlaySubscription))).scalar_one()
        assert count == 1 and len(google.acks) == 1


async def test_purchase_bound_to_one_account(env, google) -> None:  # noqa: F811
    _, maker, _ = env
    async with maker() as db, _client(google) as client:
        alice = await _user(db, "a@x.io")
        bob = await _user(db, "b@x.io")
        google.body = _google(alice.id)
        # Achat fait depuis le compte d'Alice, présenté par Bob.
        with pytest.raises(Forbidden):
            await play_billing.verify(bob.id, "tok-a", db, client=client, now=NOW)
        await play_billing.verify(alice.id, "tok-a", db, client=client, now=NOW)
        # Achat sans identifiant de compte déjà rattaché à Alice.
        google.body = _google(alice.id)
        google.body["externalAccountIdentifiers"] = {}
        with pytest.raises(Conflict):
            await play_billing.verify(bob.id, "tok-a", db, client=client, now=NOW)
        await db.refresh(bob)
        assert bob.premium_until is None


async def test_unknown_product_or_expired_never_grants(env, google) -> None:  # noqa: F811
    _, maker, _ = env
    async with maker() as db, _client(google) as client:
        user = await _user(db)
        google.body = _google(user.id, product="autre_app")
        with pytest.raises(play_billing.InvalidPurchase):
            await play_billing.verify(user.id, "tok-x", db, client=client, now=NOW)
        google.body = _google(user.id, state="SUBSCRIPTION_STATE_EXPIRED")
        await play_billing.verify(user.id, "tok-y", db, client=client, now=NOW)
        await db.refresh(user)
        assert user.premium_until is None and google.acks == []
        google.status = 404
        with pytest.raises(play_billing.InvalidPurchase):
            await play_billing.verify(user.id, "tok-z", db, client=client, now=NOW)


async def test_never_shortens_existing_premium(env, google) -> None:  # noqa: F811
    _, maker, _ = env
    later = datetime(2027, 6, 1, tzinfo=UTC)
    async with maker() as db, _client(google) as client:
        user = await _user(db, premium_until=later)
        google.body = _google(user.id)
        await play_billing.verify(user.id, "tok-1", db, client=client, now=NOW)
        await db.refresh(user)
        assert play_billing.as_utc(user.premium_until) == later


async def test_refresh_picks_up_renewal_at_most_hourly(env, google) -> None:  # noqa: F811
    _, maker, _ = env
    async with maker() as db, _client(google) as client:
        user = await _user(db)
        google.body = _google(user.id)
        await play_billing.verify(user.id, "tok-1", db, client=client, now=NOW)
        after_expiry = datetime(2026, 12, 24, tzinfo=UTC)
        google.body = _google(user.id, expiry="2027-01-23T12:00:00Z",
                              ack="ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED")
        reads = google.reads
        await play_billing.refresh_due(user.id, db, client=client, now=after_expiry)
        await db.refresh(user)
        assert play_billing.as_utc(user.premium_until) == datetime(2027, 1, 23, 12, tzinfo=UTC)
        assert google.reads == reads + 1
        # Pas encore expiré (renouvelé) : aucune relecture.
        later = after_expiry + timedelta(hours=2)
        await play_billing.refresh_due(user.id, db, client=client, now=later)
        assert google.reads == reads + 1
