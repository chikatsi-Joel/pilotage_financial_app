from __future__ import annotations

import json
from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import DbSession, UserDep
from app.models import AIAnalysis
from app.services import analytics_service, savings_service
from app.services.ai import OllamaProvider
from app.services.analytics_service import InvalidPeriod

router = APIRouter(
    prefix="/users/{user_id}/ai", tags=["ai"]
)

_ai_provider: OllamaProvider | None = None


def get_ai_provider() -> OllamaProvider | None:
    global _ai_provider
    if _ai_provider is None:
        _ai_provider = OllamaProvider()
    return _ai_provider


class AIAnalysisResponse(BaseModel):
    period: str
    summary: str
    alerts: list[dict]
    recommendations: list[dict]
    projected_impact: dict
    fallback: bool = False
    parse_error: str | None = None
    number_warnings: list[str] | None = None


class AIAnalysisStoredRead(BaseModel):
    id: str
    period: str
    model: str
    summary: str
    alerts: list[dict]
    recommendations: list[dict]
    projected_impact: dict
    fallback: bool


@router.post("/analyze", response_model=AIAnalysisResponse,)
async def analyze_period(period: str, user: UserDep, db: DbSession,):
    try:
        date.fromisoformat(period + "-01")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="period must be YYYY-MM",) from exc

    try:

        analytics = await analytics_service.compute_category_analytics(user.id, period, db)
        dash = await analytics_service.get_dashboard( user.id, period, db)
        savings_goals = await savings_service.build_goal_analyses(user.id, period, db)
        total_contributions = await savings_service.get_total_contributions_for_period(user.id, period, db)

    except InvalidPeriod as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    context = {
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
                "seasonality_strength": (
                    a.profile.seasonality_strength
                ),
                "seasonality_reliable": (
                    a.profile.seasonality_reliable
                ),
                "volatility": a.profile.volatility,
                "anomaly_score": a.profile.anomaly_score,
                "change_points": list(
                    a.profile.change_points
                ),
                "drift_score": a.profile.drift_score,
                "confidence": a.profile.confidence,
                "forecast_method": (
                    a.profile.forecast.method
                ),
                "forecast_value": a.profile.forecast.value,
                "forecast_mae": a.profile.forecast.mae,
            } for a in analytics
        ],
        "savings": {
            "current_monthly_savings": str(dash.savings),
            "savings_rate": str(dash.savings_rate),
            "total_monthly_contributions": str(total_contributions),
            "potential_additional_savings": str(dash.potential_savings),
            "unallocated_monthly_savings": str(
                max(dash.savings - total_contributions, 0)
            ),
        },
        "savings_goals": [
            goal.model_dump(mode="json")
            for goal in savings_goals
        ],
    }

    provider = get_ai_provider()
    result = await provider.analyze(context)

    """entity = AIAnalysis(
        user_id=user.id,
        period=period,
        model=provider._model,
        summary=result.get("summary", ""),
        alerts_json=json.dumps( result.get("alerts", []), ensure_ascii=False,),
        recommendations_json=json.dumps(result.get("recommendations", []), ensure_ascii=False,),
        projected_impact_json=json.dumps(
            result.get("projected_impact", {}),
            ensure_ascii=False,
        ),
        fallback=result.get("fallback", False),
    )
    db.add(entity)
    await db.commit()"""

    return AIAnalysisResponse(
        period=period,
        summary=result.get("summary", ""),
        alerts=result.get("alerts", []),
        recommendations=result.get("recommendations", []),
        projected_impact=result.get(
            "projected_impact", {}
        ),
        fallback=result.get("fallback", False),
        parse_error=result.get("parse_error"),
        number_warnings=result.get("number_warnings"),
    )


@router.get(
    "/analyses",
    response_model=list[AIAnalysisStoredRead],
)
async def list_analyses(user: UserDep, db: DbSession,):
    result = await db.execute(
        select(AIAnalysis)
        .where(AIAnalysis.user_id == user.id)
        .order_by(AIAnalysis.created_at.desc())
        .limit(20)
    )
    rows = result.scalars().all()
    return [
        AIAnalysisStoredRead(
            id=str(r.id),
            period=r.period,
            model=r.model,
            summary=r.summary,
            alerts=json.loads(r.alerts_json),
            recommendations=json.loads(
                r.recommendations_json
            ),
            projected_impact=json.loads(
                r.projected_impact_json
            ),
            fallback=r.fallback,
        )
        for r in rows
    ]


@router.get("/health")
async def ai_health():
    provider = get_ai_provider()
    return {
        "status": "ok",
        "ollama_url": provider._base_url,
        "configured_model": provider._model,
    }
