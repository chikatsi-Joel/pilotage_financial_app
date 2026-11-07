from __future__ import annotations

import json
import logging
import re
from datetime import date
from typing import Any, Protocol

import ollama as _ollama

from app.core.config import settings
from app.services.context.context_promt import SYSTEM_PROMPT

log = logging.getLogger(__name__)


RECEIPT_SYSTEM_PROMPT = """
Tu extrais les champs d'un ticket de caisse à partir de son image.

Règles :
- n'invente aucune valeur, utilise null quand l'information est illisible ;
- amount : montant total payé, nombre décimal positif ;
- category : le nom exact d'une catégorie fournie dans le contexte, sinon null ;
- expense_date : date d'achat au format YYYY-MM-DD, sinon la date du jour ;
- merchant : nom du commerçant lisible sur le ticket, sinon null ;
- description : ligne descriptive courte, sinon null.

Retourne uniquement un JSON valide de la forme :
{"amount": null, "category": null, "expense_date": null, "merchant": null, "description": null}
"""


RECEIPT_FIELDS = (
    "amount",
    "category",
    "expense_date",
    "merchant",
    "description",
)


def _empty_receipt(fallback: bool = False) -> dict[str, Any]:
    return dict.fromkeys(RECEIPT_FIELDS, None) | {"fallback": fallback}


def _coerce_receipt(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalise la sortie du modèle dans le schéma ReceiptScanRead."""
    amount = raw.get("amount")
    if isinstance(amount, str):
        amount = amount.replace(",", ".")
    try:
        amount = float(amount)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        amount = None
    else:
        if amount <= 0:
            amount = None

    date_value = raw.get("expense_date")
    if isinstance(date_value, str):
        try:
            date.fromisoformat(date_value.strip()[:10])
        except ValueError:
            date_value = None
        else:
            date_value = date_value.strip()[:10]
    else:
        date_value = None

    def _text(value: Any) -> str | None:
        if not isinstance(value, str):
            return None
        cleaned = value.strip()
        return cleaned or None

    return {
        "amount": amount,
        "category": _text(raw.get("category")),
        "expense_date": date_value,
        "merchant": _text(raw.get("merchant")),
        "description": _text(raw.get("description")),
        "fallback": False,
    }


class AIAnalysisProvider(Protocol):
    async def analyze(self, structured_context: dict[str, Any]) -> dict[str, Any]: ...



def _build_prompt(context: dict[str, Any]) -> str:
    period = context.get("period", "N/A")
    dashboard = context.get("dashboard", {})
    categories = context.get("categories", [])
    savings = context.get("savings", {})
    savings_goals = context.get("savings_goals", [])

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
            f"seasonality={cat.get('seasonality_strength', 0)} "
            f"(fiable={cat.get('seasonality_reliable', False)}), "
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

    lines.extend([
        "",
        "Contexte global d'épargne :",
        json.dumps(savings, ensure_ascii=False),
        "",
        "Objectifs d'épargne (indicateurs agrégés, sans contributions unitaires) :",
        json.dumps(savings_goals, ensure_ascii=False),
    ])

    return "\n".join(lines)


_provider: OllamaProvider | None = None


def get_provider() -> OllamaProvider | None:
    """Instance partagée du provider Ollama (créée à la demande)."""
    global _provider
    if _provider is None:
        _provider = OllamaProvider()
    return _provider


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
        self._vision_model = (
            settings.ollama_vision_model or self._model
        )
        self._timeout = timeout or settings.ollama_timeout

    def _get_client(self) -> _ollama.AsyncClient:
        headers = {}
        if settings.ollama_api_key:
            headers["Authorization"] = f"Bearer {settings.ollama_api_key}"
        return _ollama.AsyncClient(
            host=self._base_url,
            timeout=self._timeout,
            headers=headers,
        )

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
            result = _parse_response(raw)
            log.info("ai result : ", result)
            return _validate_llm_output(result, structured_context)

        except _ollama.ResponseError as exc:
            log.error("Ollama API error: %s", exc)
            return _fallback_analysis(structured_context, str(exc))
        except Exception as exc:
            log.error("Ollama connection error: %s", exc)
            return _fallback_analysis(structured_context, str(exc))

    async def scan_receipt(
        self, image_b64: str, known_categories: list[str],
    ) -> dict[str, Any]:
        """Extrait les champs d'un ticket via un modèle vision."""
        catalogue = (
            "\n".join(f"- {name}" for name in known_categories)
            or "(aucune catégorie enregistrée)"
        )
        prompt = (
            "Catégories disponibles pour cet utilisateur :\n"
            f"{catalogue}\n\n"
            "Extrais les champs de ce ticket de caisse."
        )
        client = self._get_client()
        try:
            response = await client.chat(
                model=self._vision_model,
                messages=[
                    {
                        "role": "system",
                        "content": RECEIPT_SYSTEM_PROMPT,
                    },
                    {
                        "role": "user",
                        "content": prompt,
                        "images": [image_b64],
                    },
                ],
                options={"temperature": 0.1, "format": "json"},
            )
            raw = response["message"]["content"]
            return _coerce_receipt(_parse_response(raw))

        except _ollama.ResponseError as exc:
            log.error("Ollama vision API error: %s", exc)
            return _empty_receipt(fallback=True)
        except Exception as exc:
            log.error("Ollama vision connection error: %s", exc)
            return _empty_receipt(fallback=True)


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


def _extract_known_numbers(context: dict[str, Any]) -> set[float]:
    """Extract all known numeric values from the input context."""
    numbers: set[float] = set()
    dashboard = context.get("dashboard", {})
    for key in (
        "income", "expenses", "savings",
        "savings_rate", "potential_savings",
    ):
        val = dashboard.get(key)
        if val is not None:
            try:
                numbers.add(float(val))
            except (ValueError, TypeError):
                pass
    for cat in context.get("categories", []):
        for key in (
            "current_amount", "baseline_amount",
            "expected_amount", "potential_saving",
            "opportunity_score", "level", "trend",
            "seasonality_strength", "volatility",
            "anomaly_score", "drift_score", "confidence",
            "forecast_value",
        ):
            val = cat.get(key)
            if val is not None:
                try:
                    numbers.add(float(val))
                except (ValueError, TypeError):
                    pass
    for value in _walk_numbers(context.get("savings", {})):
        numbers.add(value)
    for goal in context.get("savings_goals", []):
        for value in _walk_numbers(goal):
            numbers.add(value)
    return numbers


def _walk_numbers(value: Any) -> set[float]:
    """Extract numeric leaves from the compact savings context."""
    if isinstance(value, dict):
        return set().union(*(_walk_numbers(item) for item in value.values())) if value else set()
    if isinstance(value, list):
        return set().union(*(_walk_numbers(item) for item in value)) if value else set()
    if isinstance(value, bool) or value is None:
        return set()
    try:
        return {float(value)}
    except (ValueError, TypeError):
        return set()


def _validate_llm_output(
    result: dict[str, Any],
    context: dict[str, Any],
) -> dict[str, Any]:
    """
    Post-validation : extract all numbers from the LLM text
    and verify they exist in the input context.

    Adds 'number_warnings' to result if hallucinated numbers
    are detected.
    """
    known = _extract_known_numbers(context)

    text_fields = [result.get("summary", "")]
    for alert in result.get("alerts", []):
        text_fields.append(alert.get("message", ""))
        text_fields.append(alert.get("category", ""))
    for rec in result.get("recommendations", []):
        text_fields.append(rec.get("action", ""))
        text_fields.append(rec.get("justification", ""))

    full_text = " ".join(text_fields)
    found_numbers = re.findall(
        r"\b\d[\d\s]*[\.,]?\d*\b", full_text
    )

    warnings: list[str] = []
    for num_str in found_numbers:
        clean = num_str.replace(" ", "").replace(",", ".")
        try:
            val = float(clean)
        except ValueError:
            continue
        if val == 0:
            continue
        matched = any(
            abs(val - kf) / max(abs(kf), 1) < 0.05
            for kf in known
        )
        if not matched:
            warnings.append(num_str)

    if warnings:
        result["number_warnings"] = warnings
        log.warning(
            "LLM may have hallucinated numbers: %s", warnings
        )
    return result


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
