"""Abonnement Premium acheté sur Google Play : vérification côté serveur.

Parcours :
1. L'app lance l'achat avec `obfuscatedAccountIdAndroid = account_tag(user)` (rendu par
   `GET /billing`), puis envoie le jeton d'achat à `POST /billing/google/verify`.
2. Le backend lit l'abonnement auprès de l'API Google Play Developer (subscriptionsv2) : seul
   ce que Google renvoie fait foi, jamais ce que l'app affirme.
3. Si l'abonnement donne droit au Premium, `users.premium_until` est porté à sa date
   d'expiration (sans jamais raccourcir un premium déjà accordé), puis l'achat est confirmé
   (acknowledge) auprès de Google : sans confirmation sous 3 jours, Google le rembourse.

Renouvellements : sans notifications temps réel (RTDN, à venir), un abonnement renouvelable
dont l'expiration est passée est relu auprès de Google à la consultation de `GET /billing`
(au plus une fois par heure). Limite connue : un remboursement ne retire pas le premium déjà
accordé tant que les RTDN ne sont pas branchées.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PlaySubscription, User
from app.services import google_oauth, settings_store
from app.services.errors import Conflict, Forbidden, ServiceError

log = logging.getLogger(__name__)

SCOPE = "https://www.googleapis.com/auth/androidpublisher"
API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{package}"
TIMEOUT = 15.0
# Produit d'abonnement créé dans la Play Console ; ses offres de base : mensuel et annuel.
PRODUCT_ID = "lucia_premium"
PRODUCTS = frozenset({PRODUCT_ID})
MAX_TOKEN_LENGTH = 4096
# États où l'abonnement donne droit au Premium jusqu'à `expiryTime`. CANCELED = renouvellement
# coupé par l'utilisateur, mais la période payée reste due.
ENTITLED_STATES = frozenset(
    {
        "SUBSCRIPTION_STATE_ACTIVE",
        "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
        "SUBSCRIPTION_STATE_CANCELED",
    }
)
REFRESH_EVERY = timedelta(hours=1)


class PlayBillingError(ServiceError):
    """Google Play injoignable ou réponse inattendue."""

    status_code = 502


class PlayBillingNotConfigured(ServiceError):
    status_code = 503


class InvalidPurchase(ServiceError):
    status_code = 400


@dataclass(frozen=True)
class PlayPurchase:
    """Abonnement tel que Google le décrit (subscriptionsv2)."""

    state: str
    product_id: str
    base_plan_id: str | None
    expires_at: datetime | None
    auto_renewing: bool
    acknowledged: bool
    account_tag: str | None
    test_purchase: bool

    @property
    def entitled(self) -> bool:
        return self.state in ENTITLED_STATES and self.expires_at is not None


def account_tag(user_id: UUID) -> str:
    """Identifiant opaque du compte transmis à Google à l'achat (64 caractères max, sans
    donnée personnelle) : un achat ne peut ensuite être rattaché qu'à ce compte."""
    return hashlib.sha256(f"lucia:{user_id}".encode()).hexdigest()


def token_hash(purchase_token: str) -> str:
    return hashlib.sha256(purchase_token.encode()).hexdigest()


def _parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        # RFC 3339 avec nanosecondes possibles ("2026-12-23T10:00:00.123456789Z").
        head, _, frac = value.rstrip("Z").partition(".")
        parsed = datetime.fromisoformat(head).replace(tzinfo=UTC)
        if frac:
            parsed = parsed.replace(microsecond=int(frac[:6].ljust(6, "0")))
        return parsed
    except ValueError:
        return None


def parse_subscription(body: dict[str, Any]) -> PlayPurchase:
    """Réponse `purchases.subscriptionsv2.get` -> PlayPurchase. Plusieurs lignes (rare) :
    on retient celle de notre produit qui expire le plus tard."""
    items = [i for i in body.get("lineItems") or [] if isinstance(i, dict)]
    ours = [i for i in items if i.get("productId") in PRODUCTS] or items
    if not ours:
        raise InvalidPurchase("Achat sans abonnement")
    oldest = datetime.min.replace(tzinfo=UTC)
    item = max(ours, key=lambda i: _parse_time(i.get("expiryTime")) or oldest)
    plan = item.get("autoRenewingPlan")
    offer = item.get("offerDetails") or {}
    identifiers = body.get("externalAccountIdentifiers") or {}
    return PlayPurchase(
        state=str(body.get("subscriptionState") or "SUBSCRIPTION_STATE_UNSPECIFIED"),
        product_id=str(item.get("productId") or ""),
        base_plan_id=offer.get("basePlanId"),
        expires_at=_parse_time(item.get("expiryTime")),
        auto_renewing=bool(isinstance(plan, dict) and plan.get("autoRenewEnabled")),
        acknowledged=body.get("acknowledgementState") == "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
        account_tag=identifiers.get("obfuscatedExternalAccountId"),
        test_purchase="testPurchase" in body,
    )


async def _account() -> dict[str, str]:
    from app.services.admin.remote_config import parse_service_account

    raw = await settings_store.get("google_play_service_account") or await settings_store.get(
        "firebase_service_account"
    )
    if not raw:
        raise PlayBillingNotConfigured("Vérification des achats Google Play non configurée")
    return parse_service_account(raw)


async def _base(client: httpx.AsyncClient) -> tuple[str, dict[str, str]]:
    package = await settings_store.get("google_play_package")
    try:
        token = await google_oauth.access_token(client, await _account(), SCOPE)
    except google_oauth.GoogleAuthError as exc:
        raise PlayBillingError(str(exc)) from exc
    return API.format(package=quote(package, safe="")), {"Authorization": f"Bearer {token}"}


async def fetch(client: httpx.AsyncClient, purchase_token: str) -> PlayPurchase:
    base, headers = await _base(client)
    response = await client.get(
        f"{base}/purchases/subscriptionsv2/tokens/{quote(purchase_token, safe='')}", headers=headers
    )
    if response.status_code in (400, 404, 410):
        raise InvalidPurchase("Achat introuvable sur Google Play")
    if response.status_code != 200:
        raise PlayBillingError(f"Google Play indisponible ({response.status_code})")
    try:
        return parse_subscription(response.json())
    except ValueError as exc:
        raise PlayBillingError("Réponse inattendue de Google Play") from exc


async def acknowledge(client: httpx.AsyncClient, product_id: str, purchase_token: str) -> None:
    base, headers = await _base(client)
    response = await client.post(
        f"{base}/purchases/subscriptions/{quote(product_id, safe='')}"
        f"/tokens/{quote(purchase_token, safe='')}:acknowledge",
        headers=headers,
        json={},
    )
    if response.status_code not in (200, 204):
        raise PlayBillingError(f"Confirmation de l'achat refusée ({response.status_code})")


def as_utc(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:  # SQLite (tests)
        return value.replace(tzinfo=UTC)
    return value


async def _apply(
    user_id: UUID, purchase_token: str, purchase: PlayPurchase, db: AsyncSession, now: datetime
) -> PlaySubscription:
    """Enregistre l'abonnement et prolonge le premium ; ne valide pas la transaction."""
    digest = token_hash(purchase_token)
    row = (
        await db.execute(
            select(PlaySubscription).where(PlaySubscription.token_hash == digest).with_for_update()
        )
    ).scalar_one_or_none()
    if row is not None and row.user_id != user_id:
        raise Conflict("Cet achat est déjà rattaché à un autre compte")
    if row is None:
        row = PlaySubscription(user_id=user_id, purchase_token=purchase_token, token_hash=digest)
        db.add(row)
    row.product_id = purchase.product_id
    row.base_plan_id = purchase.base_plan_id
    row.state = purchase.state
    row.expires_at = purchase.expires_at
    row.auto_renewing = purchase.auto_renewing
    row.test_purchase = purchase.test_purchase
    row.checked_at = now
    if purchase.entitled:
        user = (
            await db.execute(select(User).where(User.id == user_id).with_for_update())
        ).scalar_one()
        current = as_utc(user.premium_until)
        if current is None or purchase.expires_at > current:  # type: ignore[operator]
            user.premium_until = purchase.expires_at
    return row


async def verify(
    user_id: UUID,
    purchase_token: str,
    db: AsyncSession,
    *,
    client: httpx.AsyncClient | None = None,
    now: datetime | None = None,
) -> PlayPurchase:
    """Vérifie un achat auprès de Google, le rattache au compte et prolonge le premium."""
    purchase_token = purchase_token.strip()
    if not purchase_token or len(purchase_token) > MAX_TOKEN_LENGTH:
        raise InvalidPurchase("Jeton d'achat invalide")
    now = now or datetime.now(UTC)
    own = client is None
    client = client or httpx.AsyncClient(timeout=TIMEOUT)
    try:
        purchase = await fetch(client, purchase_token)
        if purchase.product_id not in PRODUCTS:
            raise InvalidPurchase("Produit inconnu")
        if purchase.account_tag and purchase.account_tag != account_tag(user_id):
            raise Forbidden("Cet achat a été fait depuis un autre compte")
        await _apply(user_id, purchase_token, purchase, db, now)
        await db.commit()
        log.info(
            "play_purchase_verified user=%s product=%s plan=%s state=%s expires=%s test=%s",
            user_id, purchase.product_id, purchase.base_plan_id, purchase.state,
            purchase.expires_at.isoformat() if purchase.expires_at else None,
            purchase.test_purchase,
        )
        if purchase.entitled and not purchase.acknowledged:
            # Après la validation : l'achat n'est confirmé que s'il est bien enregistré. Un échec
            # n'est pas bloquant, l'app confirme aussi de son côté (finishTransaction).
            try:
                await acknowledge(client, purchase.product_id, purchase_token)
            except ServiceError as exc:
                log.warning("play_acknowledge_failed user=%s: %s", user_id, exc)
        return purchase
    finally:
        if own:
            await client.aclose()


async def refresh_due(
    user_id: UUID,
    db: AsyncSession,
    *,
    client: httpx.AsyncClient | None = None,
    now: datetime | None = None,
) -> None:
    """Relit auprès de Google les abonnements renouvelables arrivés à expiration (renouvellement
    probable), au plus une fois par heure chacun. Les erreurs sont journalisées, pas levées."""
    now = now or datetime.now(UTC)
    rows = (
        await db.execute(
            select(PlaySubscription).where(
                PlaySubscription.user_id == user_id,
                PlaySubscription.auto_renewing.is_(True),
                PlaySubscription.expires_at <= now,
                PlaySubscription.checked_at <= now - REFRESH_EVERY,
            )
        )
    ).scalars().all()
    # Copiés d'avance : un rollback expire les objets chargés (relecture paresseuse impossible).
    due = [(row.id, row.purchase_token) for row in rows]
    if not due:
        return
    own = client is None
    client = client or httpx.AsyncClient(timeout=TIMEOUT)
    try:
        for sub_id, token in due:
            try:
                purchase = await fetch(client, token)
                await _apply(user_id, token, purchase, db, now)
                await db.commit()
            except ServiceError as exc:
                await db.rollback()
                log.warning("play_refresh_failed user=%s sub=%s: %s", user_id, sub_id, exc)
    finally:
        if own:
            await client.aclose()


async def latest(user_id: UUID, db: AsyncSession) -> PlaySubscription | None:
    """Abonnement Google Play du compte qui expire le plus tard."""
    return (
        await db.execute(
            select(PlaySubscription)
            .where(PlaySubscription.user_id == user_id)
            .order_by(PlaySubscription.expires_at.desc().nulls_last())
            .limit(1)
        )
    ).scalar_one_or_none()
