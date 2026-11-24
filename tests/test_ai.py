from __future__ import annotations

import json
import re
from unittest.mock import AsyncMock, patch

import pytest

from app.services.ai import SYSTEM_PROMPT, OllamaProvider
from app.services.ai.prompts import build_prompt, format_number
from app.services.ai.validation import fallback_analysis, parse_response

SAMPLE_CONTEXT = {
    "period": "2026-08",
    "dashboard": {
        "income": "800000",
        "expenses": "500000",
        "savings": "300000",
        "savings_rate": "0.37500",
        "categories_in_drift": 1,
        "potential_savings": "17400",
    },
    "categories": [
        {
            "category_id": "00000000-0000-0000-0000-000000000001",
            "name": "Alimentation",
            "description": "",
            "essential": True,
            "current_amount": 150000.0,
            "baseline_amount": 145000.0,
            "expected_amount": 148000.0,
            "variation_percentage": 3.45,
            "potential_saving": 0.0,
            "opportunity_score": 0.0,
            "level": 145000.0,
            "trend": 0.02,
            "seasonality_strength": 0.1,
            "volatility": 0.05,
            "anomaly_score": 0.5,
            "change_points": [],
            "drift_score": 0.1,
            "confidence": 0.75,
            "forecast_method": "ewma",
            "forecast_value": 146000.0,
            "forecast_mae": 2000.0,
        },
        {
            "category_id": "00000000-0000-0000-0000-000000000002",
            "name": "Restaurants",
            "description": "",
            "essential": False,
            "current_amount": 87000.0,
            "baseline_amount": 55000.0,
            "expected_amount": 58000.0,
            "variation_percentage": 58.18,
            "potential_saving": 17400.0,
            "opportunity_score": 0.85,
            "level": 55000.0,
            "trend": 0.08,
            "seasonality_strength": 0.3,
            "volatility": 0.2,
            "anomaly_score": 1.8,
            "change_points": [6],
            "drift_score": 0.8,
            "confidence": 0.5,
            "forecast_method": "trend",
            "forecast_value": 62000.0,
            "forecast_mae": 5000.0,
        },
    ],
    "savings": {
        "current_monthly_savings": "300000",
        "savings_rate": "0.37500",
        "total_monthly_contributions": "120000",
        "potential_additional_savings": "17400",
        "unallocated_monthly_savings": "180000",
    },
    "savings_goals": [{
        "goal_id": "00000000-0000-0000-0000-000000000003",
        "name": "Fonds voiture",
        "description": "Épargne destinée à l'achat d'une voiture",
        "target_amount": "8400000",
        "target_date": "2028-06-01",
        "current_amount": "1200000",
        "remaining_amount": "7200000",
        "progress_percentage": 14.29,
        "contribution_count": 18,
        "average_monthly_contribution": "84000",
        "recent_monthly_contribution": "105000",
        "contribution_trend": "increasing",
        "contribution_regularity": 0.78,
        "required_monthly_contribution": "327273",
        "deadline_status": "upcoming",
    }],
}


def test_build_prompt_contains_key_data():
    prompt = build_prompt(SAMPLE_CONTEXT)
    assert "2026-08" in prompt
    assert "800000" in prompt
    assert "Restaurants" in prompt and "Alimentation" in prompt
    for key in ("actuel=", "habitude=", "variation=", "confiance=", "prévision=", "potentiel="):
        assert key in prompt, key
    assert "Fonds voiture" in prompt and "requis_par_mois=327273" in prompt


def test_build_prompt_is_compact():
    """Chaque jeton est facturé : pas d'identifiants, pas de décimales inutiles, pas de nuls."""
    prompt = build_prompt(SAMPLE_CONTEXT)
    for cat in SAMPLE_CONTEXT["categories"]:
        assert str(cat["category_id"]) not in prompt
    assert "None" not in prompt and "N/A" not in prompt
    assert not re.search(r"\d\.\d{3,}", prompt)  # au plus 2 décimales
    assert len(prompt) + len(SYSTEM_PROMPT) < 4000


def test_parse_response_valid_json():
    raw = json.dumps({
        "summary": "Situation stable",
        "alerts": [],
        "recommendations": [],
        "projected_impact": {},
    })
    result = parse_response(raw)
    assert result["summary"] == "Situation stable"
    assert "parse_error" not in result


def test_parse_response_markdown_wrapped():
    raw = (
        '```json\n{"summary": "test", "alerts": [], '
        '"recommendations": [], "projected_impact": {}}\n```'
    )
    result = parse_response(raw)
    assert result["summary"] == "test"


def test_parse_response_invalid_json():
    result = parse_response("ce n'est pas du JSON")
    assert result["summary"] == "ce n'est pas du JSON"
    assert result["parse_error"] is not None


def test_fallback_analysis_detects_drifts():
    result = fallback_analysis(SAMPLE_CONTEXT, "timeout")
    assert result["fallback"] is True
    assert len(result["alerts"]) == 1
    assert result["alerts"][0]["category"] == "Restaurants"
    assert len(result["recommendations"]) == 1
    assert "17400" in result["recommendations"][0]["action"]


def test_fallback_analysis_no_drifts():
    ctx = {
        "categories": [{
            "drift_score": 0,
            "potential_saving": 0,
            "essential": True,
        }]
    }
    result = fallback_analysis(ctx, "err")
    assert result["alerts"] == []
    assert result["recommendations"] == []


@pytest.mark.asyncio
async def test_ollama_provider_fallback_on_connection_error():
    provider = OllamaProvider(
        base_url="http://localhost:99999", model="test"
    )
    with patch.object(provider, "_get_client") as mock_get:
        mock_client = AsyncMock()
        import ollama as _ollama

        mock_client.chat.side_effect = (
            _ollama.ResponseError("connection refused")
        )
        mock_get.return_value = mock_client
        result = await provider.analyze(SAMPLE_CONTEXT)
        assert result["fallback"] is True
        summary = result["summary"]
        assert (
            "service IA indisponible" in summary
            or "connection refused" in summary
        )


@pytest.mark.asyncio
async def test_ollama_provider_success():
    provider = OllamaProvider(
        base_url="http://localhost:11434", model="test"
    )
    with patch.object(provider, "_get_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.chat.return_value = {
            "message": {
                "content": json.dumps({
                    "summary": "Analyse OK",
                    "alerts": [
                        {"category": "Restaurants"}
                    ],
                    "recommendations": [
                        {"action": "Réduire"}
                    ],
                    "projected_impact": {
                        "savings": "17400"
                    },
                }),
            },
        }
        mock_get.return_value = mock_client
        result = await provider.analyze(SAMPLE_CONTEXT)
        assert result["summary"] == "Analyse OK"
        assert len(result["alerts"]) == 1
        assert result.get("fallback") is not True


def test_build_prompt_keeps_meaningful_zeros():
    """« Rien dépensé » et « aucun revenu » ne doivent pas devenir des données manquantes."""
    ctx = json.loads(json.dumps(SAMPLE_CONTEXT, default=str))
    ctx["dashboard"]["income"] = "0"
    ctx["categories"][0]["current_amount"] = 0
    ctx["categories"][0]["drift_score"] = 0
    prompt = build_prompt(ctx)
    assert "revenu=0" in prompt
    name = ctx["categories"][0]["name"]
    first = next(line for line in prompt.splitlines() if line.startswith(f"- {name}"))
    assert "actuel=0" in first and "dérive=" not in first


def test_system_prompt_names_match_prompt_fields():
    """Les règles du prompt système citent les champs sous le nom réellement envoyé."""
    prompt = build_prompt(SAMPLE_CONTEXT)
    for key in ("anomalie", "dérive", "confiance", "prévision", "potentiel", "actuel",
                "requis_par_mois", "progression_%", "dernier_mois", "moyenne_6_mois"):
        assert key in SYSTEM_PROMPT, key
        assert f"{key}=" in prompt or key in ("anomalie", "dérive"), key
    # potential_saving reste une clé du JSON de sortie, pas un champ des données.
    for old in ("anomaly", "drift", "confidence", "forecast", "required_monthly_contribution"):
        assert old not in SYSTEM_PROMPT, old


def test_small_amounts_keep_cents():

    assert format_number(2.6) == "2.6"
    assert format_number(12345.6) == "12346"
    assert format_number(0) == "0"
