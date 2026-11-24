"""Fournisseur Gemini : choisi par AI_PROVIDER, mêmes garde-fous qu'Ollama (JSON validé, repli
lisible), et un seul nouvel essai quand le modèle est surchargé (503)."""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from google.genai import errors as genai_errors

from app.core.config import settings
from app.services import ai, settings_store
from app.services.ai.receipts import image_mime


class FakeModels:
    def __init__(self, outcomes: list) -> None:
        self.outcomes = outcomes
        self.calls: list[dict] = []

    async def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return SimpleNamespace(text=outcome, usage_metadata=None)


def _provider(monkeypatch, outcomes: list) -> tuple[ai.GeminiProvider, FakeModels]:
    values = {"gemini_api_key": "k", "gemini_model": "gemini-3.5-flash-lite"}

    async def get(key: str) -> str:
        return values.get(key, "")

    monkeypatch.setattr(settings_store, "get", get)
    provider = ai.GeminiProvider()
    provider.RETRY_DELAY = 0
    models = FakeModels(outcomes)

    async def client():
        return SimpleNamespace(aio=SimpleNamespace(models=models))

    monkeypatch.setattr(provider, "_client", client)
    return provider, models


def _server_error(code: int) -> genai_errors.ServerError:
    return genai_errors.ServerError(code, {"error": {"code": code, "message": "busy"}})


CONTEXT = {"period": "2026-11", "currency": "XAF", "totals": {"income": 300000, "expenses": 120000}}
ANSWER = json.dumps(
    {"summary": "Mois équilibré.", "alerts": [], "recommendations": [], "projected_impact": {}}
)


def test_provider_selected_by_env(monkeypatch) -> None:
    ai.reset_provider()
    monkeypatch.setattr(settings, "ai_provider", "Gemini")
    assert isinstance(ai.get_provider(), ai.GeminiProvider)
    ai.reset_provider()
    monkeypatch.setattr(settings, "ai_provider", "ollama")
    assert isinstance(ai.get_provider(), ai.OllamaProvider)
    ai.reset_provider()


async def test_analyze_returns_parsed_json(monkeypatch) -> None:
    provider, models = _provider(monkeypatch, [ANSWER])
    result = await provider.analyze(CONTEXT)
    assert result["summary"] == "Mois équilibré." and not result.get("fallback")
    config = models.calls[0]["config"]
    assert config.response_mime_type == "application/json"
    assert config.max_output_tokens == ai.MAX_OUTPUT_TOKENS
    assert models.calls[0]["model"] == "gemini-3.5-flash-lite"


async def test_retries_once_when_overloaded(monkeypatch) -> None:
    provider, models = _provider(monkeypatch, [_server_error(503), ANSWER])
    result = await provider.analyze(CONTEXT)
    assert result["summary"] == "Mois équilibré." and len(models.calls) == 2


async def test_falls_back_after_second_failure(monkeypatch) -> None:
    provider, models = _provider(monkeypatch, [_server_error(503), _server_error(503)])
    result = await provider.analyze(CONTEXT)
    assert result["fallback"] is True and len(models.calls) == 2
    assert "surchargé" in result["summary"] or "surchargé" in str(result)


async def test_bad_key_is_explained_without_retry(monkeypatch) -> None:
    error = genai_errors.ClientError(403, {"error": {"code": 403, "message": "denied"}})
    provider, models = _provider(monkeypatch, [error])
    result = await provider.analyze(CONTEXT)
    assert result["fallback"] is True and len(models.calls) == 1
    assert "Clé API Gemini" in str(result)


@pytest.mark.parametrize(
    ("b64", "mime"),
    [("iVBORw0KGgo", "image/png"), ("/9j/4AAQ", "image/jpeg"), ("UklGRiQAAABXRUJQ", "image/webp")],
)
def test_image_mime_from_signature(b64: str, mime: str) -> None:
    assert image_mime(b64) == mime
