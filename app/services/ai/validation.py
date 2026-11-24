"""Réponse d'analyse : lecture du JSON, contrôle des nombres cités et analyse de secours."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

log = logging.getLogger(__name__)

# Écart relatif toléré entre un nombre cité par le modèle et une valeur du contexte.
NUMBER_TOLERANCE = 0.05
_NUMBER = re.compile(r"\b\d[\d\s]*[\.,]?\d*\b")
_DASHBOARD_KEYS = ("income", "expenses", "savings", "savings_rate", "potential_savings")
_CATEGORY_KEYS = (
    "current_amount", "baseline_amount", "expected_amount", "potential_saving",
    "opportunity_score", "level", "trend", "seasonality_strength", "volatility",
    "anomaly_score", "drift_score", "confidence", "forecast_value", "forecast_mae",
    "forecast_low", "forecast_high", "usage_rate", "month_projection",
)


def parse_response(raw: str) -> dict[str, Any]:
    """JSON du modèle (blocs ``` tolérés) ; texte brut conservé avec `parse_error` sinon."""
    text = raw.strip()
    if text.startswith("```"):
        text = "\n".join(ln for ln in text.split("\n") if not ln.strip().startswith("```"))
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


def extract_known_numbers(context: dict[str, Any]) -> set[float]:
    """Toutes les valeurs numériques du contexte envoyé au modèle."""
    numbers: set[float] = set()
    dashboard = context.get("dashboard", {})
    numbers |= _floats(dashboard.get(key) for key in _DASHBOARD_KEYS)
    for category in context.get("categories", []):
        numbers |= _floats(category.get(key) for key in _CATEGORY_KEYS)
    numbers |= _walk_numbers(context.get("savings", {}))
    for goal in context.get("savings_goals", []):
        numbers |= _walk_numbers(goal)
    return numbers


def validate_llm_output(result: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    """Ajoute `number_warnings` si le texte cite des nombres absents du contexte (±5 %)."""
    texts = [result.get("summary", "")]
    for alert in result.get("alerts", []):
        texts += [alert.get("message", ""), alert.get("category", "")]
    for rec in result.get("recommendations", []):
        texts += [rec.get("action", ""), rec.get("justification", "")]
    warnings = unverified_numbers(texts, extract_known_numbers(context))
    if warnings:
        result["number_warnings"] = warnings
        log.warning("LLM may have hallucinated numbers: %s", warnings)
    return result


def unverified_numbers(texts: list[str], known: set[float]) -> list[str]:
    """Nombres cités dans `texts` sans valeur proche (±5 %) dans `known` ; zéros ignorés."""
    found: list[str] = []
    for raw in _NUMBER.findall(" ".join(texts)):
        try:
            value = float(raw.replace(" ", "").replace(",", "."))
        except ValueError:
            continue
        if value != 0 and not any(
            abs(value - k) / max(abs(k), 1) < NUMBER_TOLERANCE for k in known
        ):
            found.append(raw)
    return found


def numbers_in(value: Any) -> set[float]:
    """Toutes les valeurs numériques d'une structure imbriquée (dict, listes, scalaires)."""
    return _walk_numbers(value)


def fallback_analysis(context: dict[str, Any], error: str) -> dict[str, Any]:
    """Analyse déterministe quand le modèle est injoignable : dérives et économies connues."""
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
    total = sum(float(cat.get("potential_saving", 0)) for cat in categories)
    return {
        "summary": f"Analyse déterministe de secours (service IA indisponible : {error})",
        "alerts": alerts,
        "recommendations": recommendations,
        "projected_impact": {"total_potential_savings": f"{total:.0f}"},
        "fallback": True,
    }


def _floats(values: Any) -> set[float]:
    out: set[float] = set()
    for value in values:
        if value is None:
            continue
        try:
            out.add(float(value))
        except (ValueError, TypeError):
            pass
    return out


def _walk_numbers(value: Any) -> set[float]:
    """Feuilles numériques d'une structure imbriquée (épargne, objectifs)."""
    if isinstance(value, dict):
        return set().union(*map(_walk_numbers, value.values()))
    if isinstance(value, list):
        return set().union(*map(_walk_numbers, value))
    if isinstance(value, bool) or value is None:
        return set()
    try:
        return {float(value)}
    except (ValueError, TypeError):
        return set()
