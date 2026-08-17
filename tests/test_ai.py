from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

from app.services.ai import (
    OllamaProvider,
    _build_prompt,
    _fallback_analysis,
    _parse_response,
)

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
            "category_name": "Alimentation",
            "current": "150000",
            "baseline": "145000",
            "deviation": "0.03448",
            "drift_signal": "NORMAL",
            "optimization_potential": "LOW",
            "essential": True,
            "estimated_saving": "0",
        },
        {
            "category_name": "Restaurants",
            "current": "87000",
            "baseline": "55000",
            "deviation": "0.58182",
            "drift_signal": "STRONG_DRIFT",
            "optimization_potential": "HIGH",
            "essential": False,
            "estimated_saving": "17400",
        },
    ],
}


def test_build_prompt_contains_key_data():
    prompt = _build_prompt(SAMPLE_CONTEXT)
    assert "2026-08" in prompt
    assert "800000" in prompt
    assert "Restaurants" in prompt
    assert "STRONG_DRIFT" in prompt


def test_parse_response_valid_json():
    raw = json.dumps({
        "summary": "Situation stable",
        "alerts": [],
        "recommendations": [],
        "projected_impact": {},
    })
    result = _parse_response(raw)
    assert result["summary"] == "Situation stable"
    assert "parse_error" not in result


def test_parse_response_markdown_wrapped():
    raw = (
        '```json\n{"summary": "test", "alerts": [], '
        '"recommendations": [], "projected_impact": {}}\n```'
    )
    result = _parse_response(raw)
    assert result["summary"] == "test"


def test_parse_response_invalid_json():
    result = _parse_response("ce n'est pas du JSON")
    assert result["summary"] == "ce n'est pas du JSON"
    assert result["parse_error"] is not None


def test_fallback_analysis_detects_drifts():
    result = _fallback_analysis(SAMPLE_CONTEXT, "timeout")
    assert result["fallback"] is True
    assert len(result["alerts"]) == 1
    assert result["alerts"][0]["category"] == "Restaurants"
    assert len(result["recommendations"]) == 1
    assert "17400" in result["recommendations"][0]["action"]


def test_fallback_analysis_no_drifts():
    ctx = {"categories": [{"drift_signal": "NORMAL", "estimated_saving": 0, "essential": True}]}
    result = _fallback_analysis(ctx, "err")
    assert result["alerts"] == []
    assert result["recommendations"] == []


@pytest.mark.asyncio
async def test_ollama_provider_fallback_on_connection_error():
    provider = OllamaProvider(base_url="http://localhost:99999", model="test")
    with patch.object(provider, "_get_client") as mock_get:
        mock_client = AsyncMock()
        import ollama as _ollama

        mock_client.chat.side_effect = _ollama.ResponseError("connection refused")
        mock_get.return_value = mock_client
        result = await provider.analyze(SAMPLE_CONTEXT)
        assert result["fallback"] is True
        summary = result["summary"]
        assert "Ollama indisponible" in summary or "connection refused" in summary


@pytest.mark.asyncio
async def test_ollama_provider_success():
    provider = OllamaProvider(base_url="http://localhost:11434", model="test")
    with patch.object(provider, "_get_client") as mock_get:
        mock_client = AsyncMock()
        mock_client.chat.return_value = {
            "message": {
                "content": json.dumps({
                    "summary": "Analyse OK",
                    "alerts": [{"category": "Restaurants"}],
                    "recommendations": [{"action": "Réduire"}],
                    "projected_impact": {"savings": "17400"},
                }),
            },
        }
        mock_get.return_value = mock_client
        result = await provider.analyze(SAMPLE_CONTEXT)
        assert result["summary"] == "Analyse OK"
        assert len(result["alerts"]) == 1
        assert result.get("fallback") is not True
