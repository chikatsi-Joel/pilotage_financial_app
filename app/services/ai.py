from __future__ import annotations

import json
import logging
from typing import Any, Protocol

import ollama as _ollama

from app.core.config import settings

log = logging.getLogger(__name__)


class AIAnalysisProvider(Protocol):
    async def analyze(self, structured_context: dict[str, Any]) -> dict[str, Any]: ...


SYSTEM_PROMPT = (
    "Tu es un assistant financier expert en pilotage de finances personnelles. "
    "Tu reçois des données structurées (revenus, dépenses, catégories, dérives, volatilité) "
    "et tu dois fournir :\n"
    "1. Un résumé narratif de la situation financière du mois.\n"
    "2. Les principaux signaux d'alerte (dérives fortes, catégories à risque).\n"
    "3. Des recommandations concrètes et chiffrées pour réduire les dépenses.\n"
    "4. Une estimation de l'impact si les recommandations sont suivies.\n\n"
    "Réponds toujours en JSON valide avec les clés : "
    "summary, alerts, recommendations, projected_impact."
)


def _build_prompt(context: dict[str, Any]) -> str:
    period = context.get("period", "N/A")
    dashboard = context.get("dashboard", {})
    categories = context.get("categories", [])

    lines = [
        f"Période analysée : {period}",
        f"Revenu mensuel : {dashboard.get('income', 0)}",
        f"Dépenses totales : {dashboard.get('expenses', 0)}",
        f"Épargne actuelle : {dashboard.get('savings', 0)}",
        f"Taux d'épargne : {dashboard.get('savings_rate', 0)}",
        f"Catégories en dérive : {dashboard.get('categories_in_drift', 0)}",
        f"Économies potentielles : {dashboard.get('potential_savings', 0)}",
        "",
        "Détail par catégorie :",
    ]
    for cat in categories:
        lines.append(
            f"- {cat.get('name', '?')} "
            f"(id={cat.get('category_id', '?')}) : "
            f"current={cat.get('current_amount', 0)}, "
            f"baseline={cat.get('baseline_amount', 'N/A')}, "
            f"expected={cat.get('expected_amount', 'N/A')}, "
            f"variation={cat.get('variation_percentage', 0)}%, "
            f"level={cat.get('level', 0)}, "
            f"trend={cat.get('trend', 0)}, "
            f"seasonality={cat.get('seasonality_strength', 0)}, "
            f"volatility={cat.get('volatility', 0)}, "
            f"anomaly={cat.get('anomaly_score', 0)}, "
            f"change_points={cat.get('change_points', [])}, "
            f"drift={cat.get('drift_score', 0)}, "
            f"confidence={cat.get('confidence', 0)}, "
            f"forecast={cat.get('forecast_method', 'N/A')} "
            f"-> {cat.get('forecast_value', 0)} "
            f"(mae={cat.get('forecast_mae', 'N/A')}), "
            f"essential={cat.get('essential', False)}, "
            f"potential_saving={cat.get('potential_saving', 0)}, "
            f"opportunity_score={cat.get('opportunity_score', 0)}"
        )

    return "\n".join(lines)


class OllamaProvider:
    """Provider V2 : analyse financière via Ollama (Gemma / modèles locaux)."""

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float | None = None,
    ):
        self._base_url = base_url or settings.ollama_base_url
        self._model = model or settings.ollama_model
        self._timeout = timeout or settings.ollama_timeout

    def _get_client(self) -> _ollama.AsyncClient:
        return _ollama.AsyncClient(host=self._base_url, timeout=self._timeout)

    async def analyze(self, structured_context: dict[str, Any]) -> dict[str, Any]:
        prompt = _build_prompt(structured_context)
        client = self._get_client()
        try:
            response = await client.chat(
                model=self._model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                options={"temperature": 0.3},
            )
            raw = response["message"]["content"]
            return _parse_response(raw)
        except _ollama.ResponseError as exc:
            log.error("Ollama API error: %s", exc)
            return _fallback_analysis(structured_context, str(exc))
        except Exception as exc:
            log.error("Ollama connection error: %s", exc)
            return _fallback_analysis(structured_context, str(exc))


def _parse_response(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [ln for ln in lines if not ln.strip().startswith("```")]
        text = "\n".join(lines)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {
            "summary": text,
            "alerts": [],
            "recommendations": [],
            "projected_impact": {},
            "parse_error": "La réponse du modèle n'est pas du JSON valide.",
        }


def _fallback_analysis(context: dict[str, Any], error: str) -> dict[str, Any]:
    categories = context.get("categories", [])
    alerts: list[dict[str, Any]] = []
    recommendations: list[dict[str, Any]] = []
    for cat in categories:
        drift = cat.get("drift_score", 0)
        if drift >= 0.5:
            alerts.append({
                "category": cat.get("name"),
                "drift_score": drift,
                "anomaly_score": cat.get("anomaly_score", 0),
                "variation_percentage": cat.get("variation_percentage", 0),
            })
        saving = float(cat.get("potential_saving", 0))
        if saving > 0 and not cat.get("essential", False):
            recommendations.append({
                "category": cat.get("name"),
                "action": f"Réduire de {saving:.0f} par mois",
                "justification": (
                    f"opportunity_score={cat.get('opportunity_score', 0):.2f}, "
                    f"confidence={cat.get('confidence', 0):.2f}, "
                    f"forecast={cat.get('forecast_method', 'N/A')} "
                    f"-> {cat.get('forecast_value', 0):.0f}"
                ),
            })
    total = sum(
        float(cat.get("potential_saving", 0)) for cat in categories
    )
    return {
        "summary": f"Analyse déterministe de secours (Ollama indisponible : {error})",
        "alerts": alerts,
        "recommendations": recommendations,
        "projected_impact": {"total_potential_savings": f"{total:.0f}"},
        "fallback": True,
    }
