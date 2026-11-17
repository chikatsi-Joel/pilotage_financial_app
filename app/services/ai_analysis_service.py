"""Construction du contexte d'analyse IA et exécution de l'analyse d'un mois."""

from __future__ import annotations

import hashlib
import json
import math
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.upsert import upsert
from app.models import AIAnalysis
from app.services import analytics_service, savings_service
from app.services.ai import PROMPT_VERSION, SYSTEM_PROMPT, validate_llm_output


async def build_context(user_id: UUID, period: str, db: AsyncSession) -> dict[str, Any]:
    # Analytics du cache (recalculés une seule fois s'ils sont absents ou périmés).
    analytics = await analytics_service.get_category_analytics_snapshot(user_id, period, db)
    dash = await analytics_service.build_dashboard(user_id, period, db, analytics)
    savings_goals = await savings_service.build_goal_analyses(user_id, period, db)
    total_contributions = await savings_service.get_total_contributions_for_period(
        user_id, period, db
    )
    return {
        "period": period,
        "dashboard": {
            "income": str(dash.income),
            "expenses": str(dash.expenses),
            "savings": str(dash.savings),
            "savings_rate": str(dash.savings_rate),
            "categories_in_drift": dash.categories_in_drift,
            "potential_savings": str(dash.potential_savings),
        },
        "categories": [
            {
                "category_id": str(a.category_id),
                "name": a.name,
                "description": a.description,
                "essential": a.essential,
                "current_amount": a.current_amount,
                "baseline_amount": a.baseline_amount,
                "expected_amount": a.expected_amount,
                "variation_percentage": a.variation_percentage,
                "potential_saving": a.potential_saving,
                "opportunity_score": a.opportunity_score,
                "level": a.profile.level,
                "trend": a.profile.trend,
                "seasonality_strength": a.profile.seasonality_strength,
                "seasonality_reliable": a.profile.seasonality_reliable,
                "volatility": a.profile.volatility,
                "anomaly_score": a.profile.anomaly_score,
                "change_points": list(a.profile.change_points),
                "drift_score": a.profile.drift_score,
                "confidence": a.profile.confidence,
                "forecast_method": a.profile.forecast.method,
                "forecast_value": a.profile.forecast.value,
                "forecast_mae": a.profile.forecast.mae,
                "forecast_low": a.profile.forecast.low,
                "forecast_high": a.profile.forecast.high,
                "usage_rate": a.profile.forecast.usage_rate,
                "month_projection": a.profile.forecast.projection,
            }
            for a in analytics
        ],
        "savings": {
            "current_monthly_savings": str(dash.savings),
            "savings_rate": str(dash.savings_rate),
            "total_monthly_contributions": str(total_contributions),
            "potential_additional_savings": str(dash.potential_savings),
            "unallocated_monthly_savings": str(
                max(Decimal(str(dash.savings)) - total_contributions, Decimal(0))
            ),
        },
        "savings_goals": [goal.model_dump(mode="json") for goal in savings_goals],
    }


def fingerprint(context: dict[str, Any], model: str) -> str:
    """Empreinte de ce qui détermine l'analyse : modèle, version et texte du prompt, données."""
    payload = json.dumps(
        [model, PROMPT_VERSION, SYSTEM_PROMPT, context],
        sort_keys=True,
        default=str,
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _stored_result(row: AIAnalysis) -> dict[str, Any]:
    return {
        "summary": row.summary,
        "alerts": json.loads(row.alerts_json),
        "recommendations": json.loads(row.recommendations_json),
        "projected_impact": json.loads(row.projected_impact_json),
        "fallback": False,
        "cached": True,
    }


async def _model_name(provider: Any) -> str:
    try:
        return str(await provider.model())[:80]
    except Exception:  # fournisseur sans modèle lisible : l'empreinte s'en passe
        return ""


# Relance forcée (« tirer pour rafraîchir ») : au plus une par mois analysé et par utilisateur
# dans cet intervalle. Chaque relance est un appel payant au modèle.
FORCE_COOLDOWN = timedelta(minutes=10)


def _cooldown_left(created_at: datetime | None, now: datetime) -> int:
    """Secondes avant la prochaine relance forcée possible (0 : autorisée)."""
    if created_at is None:
        return 0
    if created_at.tzinfo is None:  # SQLite (tests) : horodatage naïf en UTC
        created_at = created_at.replace(tzinfo=UTC)
    return max(0, math.ceil((created_at + FORCE_COOLDOWN - now).total_seconds()))


async def analyze(
    user_id: UUID,
    period: str,
    db: AsyncSession,
    provider: Any,
    *,
    force: bool = False,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Analyse IA du mois, resservie depuis la base tant que les données n'ont pas changé.

    Le modèle (lent et payant) n'est appelé que si l'empreinte du contexte (analytics,
    totaux, objectifs, modèle configuré) diffère de celle de la dernière analyse enregistrée,
    ou sur demande explicite (`force`, limitée à une par FORCE_COOLDOWN : au-delà, l'analyse
    enregistrée est resservie avec `retry_after` en secondes). Une réponse de secours (`fallback`, modèle
    injoignable) ou illisible (`parse_error`) n'est pas enregistrée : la visite suivante
    réessaie. Une analyse resservie repasse la vérification des chiffres (déterministe : même
    empreinte, donc même contexte) pour garder ses `number_warnings`.

    La transaction de lecture est terminée avant l'appel au modèle (plusieurs secondes) : la
    connexion retourne au pool au lieu d'être monopolisée pendant l'attente réseau.
    """
    context = await build_context(user_id, period, db)
    model = await _model_name(provider)
    digest = fingerprint(context, model)
    stored = (
        await db.execute(
            select(AIAnalysis).where(AIAnalysis.user_id == user_id, AIAnalysis.period == period)
        )
    ).scalar_one_or_none()
    await db.commit()
    if stored is not None and not force and stored.context_hash == digest:
        return validate_llm_output(_stored_result(stored), context)
    # Limite seulement une relance sur des données INCHANGÉES : si une dépense a été ajoutée,
    # l'empreinte diffère et le modèle est rappelé, comme pour un affichage normal.
    if stored is not None and force and stored.context_hash == digest:
        wait = _cooldown_left(stored.created_at, now or datetime.now(UTC))
        if wait > 0:
            return validate_llm_output(_stored_result(stored), context) | {"retry_after": wait}

    result = await provider.analyze(context)
    if not result.get("fallback") and not result.get("parse_error"):
        await upsert(
            db,
            AIAnalysis,
            [
                {
                    "id": uuid4(),
                    "user_id": user_id,
                    "period": period,
                    "model": model,
                    "summary": result.get("summary", ""),
                    "alerts_json": json.dumps(result.get("alerts", []), ensure_ascii=False),
                    "recommendations_json": json.dumps(
                        result.get("recommendations", []), ensure_ascii=False
                    ),
                    "projected_impact_json": json.dumps(
                        result.get("projected_impact", {}), ensure_ascii=False
                    ),
                    "fallback": False,
                    "context_hash": digest,
                    "created_at": func.now(),
                }
            ],
            conflict_columns=("user_id", "period"),
            update_columns=(
                "model", "summary", "alerts_json", "recommendations_json",
                "projected_impact_json", "context_hash", "created_at",
            ),
        )
        await db.commit()
    return result
