"""Abonnement Premium : état du compte et vérification des achats Google Play."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.api.deps import DbSession, UserDep
from app.services import ai_quota, play_billing

router = APIRouter(prefix="/users/{user_id}/billing", tags=["billing"])


class PlaySubscriptionRead(BaseModel):
    product_id: str
    base_plan_id: str | None
    state: str
    expires_at: str | None
    auto_renewing: bool


class BillingRead(BaseModel):
    premium: bool
    premium_until: str | None
    # À passer tel quel à Google Play (obfuscatedAccountIdAndroid) au lancement d'un achat.
    account_tag: str
    product_id: str
    subscription: PlaySubscriptionRead | None


class VerifyRequest(BaseModel):
    purchase_token: str = Field(min_length=1, max_length=play_billing.MAX_TOKEN_LENGTH)


async def _status(user, db) -> BillingRead:
    await db.refresh(user, ["premium_until"])
    sub = await play_billing.latest(user.id, db)
    until = play_billing.as_utc(user.premium_until)
    return BillingRead(
        premium=ai_quota.is_premium(until, datetime.now(UTC)),
        premium_until=until.isoformat() if until else None,
        account_tag=play_billing.account_tag(user.id),
        product_id=play_billing.PRODUCT_ID,
        subscription=PlaySubscriptionRead(
            product_id=sub.product_id,
            base_plan_id=sub.base_plan_id,
            state=sub.state,
            expires_at=play_billing.as_utc(sub.expires_at).isoformat() if sub.expires_at else None,
            auto_renewing=sub.auto_renewing,
        )
        if sub
        else None,
    )


@router.get("", response_model=BillingRead)
async def billing_status(user: UserDep, db: DbSession):
    """État Premium du compte ; relit au passage auprès de Google un abonnement renouvelable
    arrivé à expiration (renouvellement)."""
    await play_billing.refresh_due(user.id, db)
    return await _status(user, db)


@router.post("/google/verify", response_model=BillingRead)
async def verify_google_purchase(body: VerifyRequest, user: UserDep, db: DbSession):
    """Vérifie un achat Google Play auprès de Google et active le Premium s'il est valide."""
    await play_billing.verify(user.id, body.purchase_token, db)
    return await _status(user, db)
