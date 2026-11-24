from __future__ import annotations

import json
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.api.deps import DbSession, UserDep
from app.models import AIAnalysis
from app.schemas.common import PaginatedResponse
from app.services import ai_analysis_service, ai_explain_service, ai_quota
from app.services.ai import AIProvider, get_provider
from app.services.pagination import paginate
from app.services.periods import parse_period

router = APIRouter(
    prefix="/users/{user_id}/ai", tags=["ai"]
)


def get_ai_provider() -> AIProvider | None:
    return get_provider()


class QuotaRead(BaseModel):
    """Quota d'analyses IA du mois. `limit`/`remaining` None : illimité."""

    enabled: bool
    premium: bool
    limit: int | None
    used: int
    remaining: int | None
    resets_at: str


class AIAnalysisResponse(BaseModel):
    period: str
    summary: str
    alerts: list[dict]
    recommendations: list[dict]
    projected_impact: dict
    fallback: bool = False
    # True : analyse enregistrée resservie (données inchangées depuis), sans appel au modèle.
    cached: bool = False
    # Relance forcée refusée (trop rapprochée) : secondes avant la prochaine possible.
    retry_after: int | None = None
    parse_error: str | None = None
    number_warnings: list[str] | None = None
    # Freemium (compte gratuit) : quota du mois épuisé pour une nouvelle analyse demandée
    # (dernière analyse resservie, ou résumé vide s'il n'y en a pas).
    quota_exceeded: bool = False
    # Même analyse déjà en cours (autre écran) : rien n'est consommé, réessayer dans un instant.
    pending: bool = False
    # Dernière analyse resservie alors que les données ont changé depuis ; `analyzed_at` : sa date.
    stale: bool = False
    analyzed_at: str | None = None
    quota: QuotaRead | None = None


class CategoryExplanationResponse(BaseModel):
    """« Comprendre avec l'IA » sur une catégorie de dépenses."""

    period: str
    category_id: UUID
    summary: str
    points: list[str]
    # Explication enregistrée resservie (données inchangées) : rien n'est consommé.
    cached: bool = False
    # Modèle injoignable : explication chiffrée sans IA ; `error` en donne la raison.
    fallback: bool = False
    error: str | None = None
    quota_exceeded: bool = False
    pending: bool = False
    stale: bool = False
    analyzed_at: str | None = None
    number_warnings: list[str] | None = None
    quota: QuotaRead


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
async def analyze_period(
    period: str,
    user: UserDep,
    db: DbSession,
    force: Annotated[bool, Query()] = False,
):
    """Analyse du mois, resservie depuis la base si ses données n'ont pas changé.

    `force=true` relance le modèle même si une analyse à jour existe (compte gratuit sous
    freemium : met à jour une analyse périmée, en consommant une analyse du quota).
    """
    parse_period(period)

    provider = get_ai_provider()
    # Contexte lu puis connexion libérée avant l'appel au modèle (voir ai_analysis_service).
    result = await ai_analysis_service.analyze(user.id, period, db, provider, force=force)

    return AIAnalysisResponse(
        period=period,
        summary=result.get("summary", ""),
        alerts=result.get("alerts", []),
        recommendations=result.get("recommendations", []),
        projected_impact=result.get(
            "projected_impact", {}
        ),
        fallback=result.get("fallback", False),
        cached=result.get("cached", False),
        retry_after=result.get("retry_after"),
        parse_error=result.get("parse_error"),
        number_warnings=result.get("number_warnings"),
        quota_exceeded=result.get("quota_exceeded", False),
        pending=result.get("pending", False),
        stale=result.get("stale", False),
        analyzed_at=result.get("analyzed_at"),
        quota=QuotaRead(**(await ai_quota.status(user.id, db)).as_dict()),
    )


@router.post("/explain/category", response_model=CategoryExplanationResponse)
async def explain_category(period: str, category_id: UUID, user: UserDep, db: DbSession):
    """Explication ciblée d'une catégorie de dépenses pour le mois (voir ai_explain_service)."""
    parse_period(period)
    result = await ai_explain_service.explain_category(
        user.id, period, category_id, db, get_ai_provider()
    )
    return CategoryExplanationResponse(
        period=period,
        category_id=category_id,
        quota=QuotaRead(**(await ai_quota.status(user.id, db)).as_dict()),
        **result,
    )


@router.get("/quota", response_model=QuotaRead)
async def quota(user: UserDep, db: DbSession):
    """Analyses IA restantes ce mois-ci (freemium)."""
    return QuotaRead(**(await ai_quota.status(user.id, db)).as_dict())


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
        "provider": provider.name,
        "ollama_url": await provider.base_url(),
        "configured_model": await provider.model(),
    }
