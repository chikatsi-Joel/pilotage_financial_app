from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import DbSession, UserDep
from app.models import AIAnalysis
from app.schemas.common import PaginatedResponse
from app.services.periods import parse_period
from app.services import ai_analysis_service
from app.services.ai import OllamaProvider, get_provider
from app.services.pagination import paginate

router = APIRouter(
    prefix="/users/{user_id}/ai", tags=["ai"]
)


def get_ai_provider() -> OllamaProvider | None:
    return get_provider()


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
    parse_period(period)

    context = await ai_analysis_service.build_context(user.id, period, db)

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
    response_model=PaginatedResponse[AIAnalysisStoredRead],
)
async def list_analyses(
    user: UserDep,
    db: DbSession,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    query = (
        select(AIAnalysis)
        .where(AIAnalysis.user_id == user.id)
    )

    items, next_cursor, has_more = await paginate(
        db, query, limit, cursor,
        id_col=AIAnalysis.id, sort_col=AIAnalysis.created_at, sort_desc=True,
    )

    return PaginatedResponse(
        items=[
            AIAnalysisStoredRead(
                id=str(r.id),
                period=r.period,
                model=r.model,
                summary=r.summary,
                alerts=json.loads(r.alerts_json),
                recommendations=json.loads(r.recommendations_json),
                projected_impact=json.loads(r.projected_impact_json),
                fallback=r.fallback,
            )
            for r in items
        ],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/health")
async def ai_health():
    provider = get_ai_provider()
    return {
        "status": "ok",
        "ollama_url": provider._base_url,
        "configured_model": provider._model,
    }
