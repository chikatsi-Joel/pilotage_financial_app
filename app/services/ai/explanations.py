"""Explication d'une catégorie : lecture de la réponse du modèle et explication de secours."""

from __future__ import annotations

from typing import Any

from app.services.ai.prompts import format_number
from app.services.ai.validation import parse_response

# À incrémenter quand CATEGORY_SYSTEM_PROMPT ou build_category_prompt change : les
# explications enregistrées sont alors régénérées.
EXPLAIN_PROMPT_VERSION = 1
# Réponse courte : 2-3 phrases et 2-3 points.
EXPLAIN_MAX_OUTPUT_TOKENS = 400
MAX_POINTS = 3


def parse_explanation(raw: str) -> dict[str, Any] | None:
    """`{"summary", "points"}` nettoyés ; None si la réponse est inexploitable."""
    data = parse_response(raw)
    if data.get("parse_error"):
        return None
    summary = data.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        return None
    points = data.get("points")
    clean = [p.strip() for p in points if isinstance(p, str) and p.strip()] if isinstance(
        points, list
    ) else []
    return {"summary": summary.strip(), "points": clean[:MAX_POINTS]}


def fallback_explanation(context: dict[str, Any]) -> dict[str, Any]:
    """Explication sans modèle, à partir des seuls chiffres de la catégorie."""
    cat = context["category"]
    currency = context["currency"]
    current = format_number(cat.get("current_amount")) or "0"
    sentences = [f"Ce mois-ci, {cat['name']} représente {current} {currency} de dépenses."]
    expected = format_number(cat.get("expected_amount"))
    variation = cat.get("variation_pct")
    if expected and variation is not None:
        direction = "au-dessus" if variation > 0 else "en dessous"
        sentences.append(
            f"C'est {format_number(abs(variation), 1)} % {direction} de votre habitude "
            f"à cette date ({expected} {currency})."
        )
    points: list[str] = []
    projection = format_number(cat.get("projection"))
    if projection:
        points.append(f"Fin de mois prévue : environ {projection} {currency}.")
    if cat.get("budget_used_pct") is not None:
        points.append(f"Budget utilisé : {format_number(cat['budget_used_pct'], 1)} %.")
    return {"summary": " ".join(sentences), "points": points, "fallback": True}
