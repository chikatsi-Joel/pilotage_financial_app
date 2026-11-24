"""« Comprendre avec l'IA » sur une catégorie de dépenses : explication ciblée d'un mois.

Même règle que l'analyse du mois : le modèle n'est appelé que si le contexte de la catégorie a
changé depuis la dernière explication enregistrée (nouvelle dépense, nouveau modèle ou
prompt). Freemium (compte gratuit) : chaque nouvelle explication consomme une analyse du
quota mensuel ; revoir une explication à jour ne consomme rien.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import logging
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.upsert import upsert
from app.models import AIExplanation, Category, Essentiality, Expense, User
from app.services import ai_quota, analytics_service
from app.services.ai.base import AIProvider, model_name
from app.services.ai.explanations import (
    EXPLAIN_MAX_OUTPUT_TOKENS,
    EXPLAIN_PROMPT_VERSION,
    fallback_explanation,
    parse_explanation,
)
from app.services.ai.prompts import CATEGORY_SYSTEM_PROMPT, build_category_prompt
from app.services.ai.validation import numbers_in, unverified_numbers
from app.services.errors import NotFound
from app.services.periods import month_bounds

log = logging.getLogger(__name__)

TOP_EXPENSES = 5
# Seuil de dérive au-delà duquel la hausse est signalée comme durable (comme l'analyse de secours).
DRIFT_THRESHOLD = 0.5
_EMPTY: dict[str, Any] = {"summary": "", "points": [], "fallback": False}


async def build_category_context(
    user_id: UUID, period: str, category_id: UUID, db: AsyncSession, today: date
) -> dict[str, Any]:
    """Ce que le modèle reçoit sur la catégorie : chiffres du mois, habitude, prévision,
    budget et plus grosses dépenses. Les pourcentages sont calculés ici (jamais par le modèle)."""
    category = (
        await db.execute(
            select(Category).where(Category.id == category_id, Category.user_id == user_id)
        )
    ).scalar_one_or_none()
    if category is None:
        raise NotFound("Catégorie introuvable")
    currency = (await db.execute(select(User.currency).where(User.id == user_id))).scalar_one()
    analytics = await analytics_service.get_category_analytics_snapshot(user_id, period, db)
    stats = next((a for a in analytics if a.category_id == category_id), None)

    start, end = month_bounds(period)
    in_month = (
        Expense.user_id == user_id,
        Expense.category_id == category_id,
        Expense.expense_date.between(start, end),
    )
    top = (
        await db.execute(
            select(Expense.amount, Expense.expense_date, Expense.note)
            .where(*in_month)
            .order_by(Expense.amount.desc(), Expense.expense_date)
            .limit(TOP_EXPENSES)
        )
    ).all()
    count = (
        await db.execute(select(func.count()).select_from(Expense).where(*in_month))
    ).scalar_one()

    current = float(stats.current_amount) if stats else 0.0
    expected = float(stats.expected_amount) if stats and stats.expected_amount else None
    budget = float(category.monthly_budget) if category.monthly_budget else None
    forecast = stats.profile.forecast if stats else None
    context: dict[str, Any] = {
        "period": period,
        "currency": currency,
        "category": {
            "name": category.name,
            "essential": category.essentiality == Essentiality.ESSENTIAL,
            "current_amount": current,
            "baseline_amount": float(stats.baseline_amount) if stats else None,
            "expected_amount": expected,
            "variation_pct": round(stats.variation_percentage, 1) if stats and expected else None,
            "budget": budget,
            "budget_used_pct": round(current / budget * 100, 1) if budget else None,
            "projection": forecast.projection if forecast else None,
            "forecast_low": forecast.low if forecast else None,
            "forecast_high": forecast.high if forecast else None,
            "potential_saving": float(stats.potential_saving) if stats else None,
            "drifting": bool(stats and stats.profile.drift_score >= DRIFT_THRESHOLD),
        },
        "expense_count": count,
        "top_expenses": [
            {"day": d.day, "amount": float(amount), "note": (note or "").strip()[:60] or None}
            for amount, d, note in top
        ],
    }
    if start <= today <= end:
        context["month_progress"] = {"day": today.day, "days_in_month": end.day}
    return context


def fingerprint(context: dict[str, Any], model: str) -> str:
    """Empreinte de ce qui détermine l'explication : modèle, version et texte du prompt, données."""
    payload = json.dumps(
        [model, EXPLAIN_PROMPT_VERSION, CATEGORY_SYSTEM_PROMPT, context],
        sort_keys=True,
        default=str,
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


async def explain_category(
    user_id: UUID,
    period: str,
    category_id: UUID,
    db: AsyncSession,
    provider: AIProvider,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Explication de la catégorie pour le mois : enregistrée si à jour, sinon générée.

    Réponse : `summary`, `points`, et selon le cas `cached` (resservie), `stale` (ancienne,
    quota épuisé), `quota_exceeded`, `pending` (même explication en cours), `fallback`
    (modèle injoignable : explication chiffrée sans IA, rien n'est consommé).
    """
    now = now or datetime.now(UTC)
    context = await build_category_context(user_id, period, category_id, db, now.date())
    digest = fingerprint(context, await model_name(provider))
    stored = (
        await db.execute(
            select(AIExplanation).where(
                AIExplanation.user_id == user_id,
                AIExplanation.category_id == category_id,
                AIExplanation.period == period,
            )
        )
    ).scalar_one_or_none()
    quota = await ai_quota.status(user_id, db, now)
    await db.commit()  # fin de la lecture avant l'appel au modèle (plusieurs secondes)
    if stored is not None and stored.context_hash == digest:
        return _stored_result(stored) | {"cached": True}

    usage_id = None
    if quota.metered:
        reservation = await ai_quota.reserve(user_id, period, digest, db, now)
        if reservation is ai_quota.Reservation.EXCEEDED:
            return _previous(stored) | {"quota_exceeded": True}
        if reservation is ai_quota.Reservation.IN_FLIGHT:
            return _previous(stored) | {"pending": True}
        usage_id = reservation

    try:
        explanation, error = await _generate(context, provider)
    except BaseException:  # annulation : rendre la réservation sans masquer l'erreur
        if usage_id is not None:
            with contextlib.suppress(Exception):
                await ai_quota.release(usage_id, db)
        raise
    if explanation is None:
        if usage_id is not None:
            await ai_quota.release(usage_id, db)
        return fallback_explanation(context) | {"error": error}

    await _save(user_id, category_id, period, digest, await model_name(provider), explanation, db)
    texts = [explanation["summary"], *explanation["points"]]
    warnings = unverified_numbers(texts, numbers_in(context))
    if warnings:
        log.warning("Explication : nombres non vérifiés %s", warnings)
    return explanation | {"fallback": False, "number_warnings": warnings or None}


async def _generate(
    context: dict[str, Any], provider: AIProvider
) -> tuple[dict[str, Any] | None, str | None]:
    """(explication, None) ou (None, message d'erreur lisible)."""
    try:
        raw = await provider.complete_json(
            CATEGORY_SYSTEM_PROMPT,
            build_category_prompt(context),
            max_output_tokens=EXPLAIN_MAX_OUTPUT_TOKENS,
        )
    except Exception as exc:
        log.error("Explication IA impossible : %s", exc)
        return None, provider.describe_error(exc)
    explanation = parse_explanation(raw)
    return explanation, None if explanation else "Réponse du modèle illisible"


async def _save(
    user_id: UUID,
    category_id: UUID,
    period: str,
    digest: str,
    model: str,
    explanation: dict[str, Any],
    db: AsyncSession,
) -> None:
    await upsert(
        db,
        AIExplanation,
        [
            {
                "id": uuid4(),
                "user_id": user_id,
                "category_id": category_id,
                "period": period,
                "model": model,
                "summary": explanation["summary"],
                "points_json": json.dumps(explanation["points"], ensure_ascii=False),
                "context_hash": digest,
                "created_at": func.now(),
            }
        ],
        conflict_columns=("user_id", "category_id", "period"),
        update_columns=("model", "summary", "points_json", "context_hash", "created_at"),
    )
    await db.commit()


def _stored_result(row: AIExplanation) -> dict[str, Any]:
    return {"summary": row.summary, "points": json.loads(row.points_json), "fallback": False}


def _previous(stored: AIExplanation | None) -> dict[str, Any]:
    """Dernière explication (périmée) si elle existe, sinon une réponse vide."""
    if stored is None:
        return dict(_EMPTY)
    created = stored.created_at
    if created is not None and created.tzinfo is None:  # SQLite (tests)
        created = created.replace(tzinfo=UTC)
    return _stored_result(stored) | {
        "stale": True,
        "analyzed_at": created.isoformat() if created else None,
    }
