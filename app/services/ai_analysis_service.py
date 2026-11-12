"""Construction du contexte d'analyse IA et exécution de l'analyse d'un mois."""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import analytics_service, savings_service


async def build_context(user_id: UUID, period: str, db: AsyncSession) -> dict[str, Any]:
    # Un seul calcul des analytics (get_dashboard les recalculait une seconde fois).
    analytics = await analytics_service.compute_category_analytics(user_id, period, db)
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


async def analyze(user_id: UUID, period: str, db: AsyncSession, provider: Any) -> dict[str, Any]:
    """Contexte du mois + appel du fournisseur d'IA.

    La transaction de lecture est terminée avant l'appel au modèle (plusieurs secondes) : la
    connexion retourne au pool au lieu d'être monopolisée pendant l'attente réseau.
    """
    context = await build_context(user_id, period, db)
    await db.commit()
    return await provider.analyze(context)
