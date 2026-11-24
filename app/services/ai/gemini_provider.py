"""Fournisseur Gemini (Google AI Studio), via le SDK google-genai."""

from __future__ import annotations

import asyncio
import base64
import logging
from typing import Any

from google import genai
from google.genai import errors, types

from app.core.config import settings
from app.services import settings_store
from app.services.ai.base import ANALYSIS_TEMPERATURE, MAX_OUTPUT_TOKENS, RECEIPT_TEMPERATURE
from app.services.ai.prompts import (
    RECEIPT_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
    build_prompt,
    build_receipt_prompt,
)
from app.services.ai.receipts import coerce_receipt, empty_receipt, image_mime
from app.services.ai.validation import fallback_analysis, parse_response, validate_llm_output

log = logging.getLogger(__name__)

# Erreurs passagères côté Google (503 « forte demande », fréquent sur les petits modèles).
_RETRYABLE = frozenset({500, 503})


class GeminiProvider:
    """Analyse et lecture de tickets via `generate_content`. Clé et modèle sont relus dans la
    configuration (backoffice, sinon .env) à chaque appel."""

    name = "gemini"
    BASE_URL = "https://generativelanguage.googleapis.com"
    RETRY_DELAY = 2.0

    def __init__(self, model: str | None = None, timeout: float | None = None) -> None:
        self._model_override = model
        self._timeout = timeout or settings.ollama_timeout
        # Un seul client, recréé si la clé change dans le backoffice.
        self._client_key: str | None = None
        self._client_instance: genai.Client | None = None

    async def base_url(self) -> str:
        return self.BASE_URL

    async def model(self) -> str:
        return self._model_override or await settings_store.get("gemini_model")

    async def vision_model(self) -> str:
        return await settings_store.get("gemini_vision_model") or await self.model()

    async def complete_json(
        self, system_prompt: str, user_prompt: str, *, max_output_tokens: int = MAX_OUTPUT_TOKENS
    ) -> str:
        """Réponse JSON brute du modèle ; lève en cas d'échec (voir `describe_error`)."""
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=ANALYSIS_TEMPERATURE,
            max_output_tokens=max_output_tokens,
            response_mime_type="application/json",
        )
        return await self._generate(await self.model(), user_prompt, config)

    def describe_error(self, exc: Exception) -> str:
        """Message lisible pour l'utilisateur ; le détail brut reste dans les logs."""
        if not isinstance(exc, errors.APIError):
            return str(exc)
        if exc.code in (401, 403) or (exc.code == 400 and "API key" in str(exc)):
            return (
                "Clé API Gemini absente ou invalide (backoffice › Configuration, ou GEMINI_API_KEY)"
            )
        if exc.code == 404:
            return "Modèle Gemini introuvable (GEMINI_MODEL)"
        if exc.code == 429:
            return "Quota Gemini atteint : réessayez plus tard"
        if exc.code in _RETRYABLE:
            return "Gemini est momentanément surchargé : réessayez dans un instant"
        return f"Erreur Gemini ({exc.code})"

    async def analyze(self, structured_context: dict[str, Any]) -> dict[str, Any]:
        """Analyse du mois ; analyse de secours si Gemini échoue."""
        try:
            raw = await self.complete_json(SYSTEM_PROMPT, build_prompt(structured_context))
        except Exception as exc:
            log.error("Gemini error: %s", exc)
            return fallback_analysis(structured_context, self.describe_error(exc))
        result = parse_response(raw)
        log.debug("ai result : %s", result)  # contenu financier : pas en INFO
        return validate_llm_output(result, structured_context)

    async def scan_receipt(self, image_b64: str, known_categories: list[str]) -> dict[str, Any]:
        """Champs d'un ticket ; ticket vide (`fallback`) si Gemini échoue."""
        config = types.GenerateContentConfig(
            system_instruction=RECEIPT_SYSTEM_PROMPT,
            temperature=RECEIPT_TEMPERATURE,
            response_mime_type="application/json",
        )
        try:
            image = types.Part.from_bytes(
                data=base64.b64decode(image_b64), mime_type=image_mime(image_b64)
            )
            raw = await self._generate(
                await self.vision_model(), [image, build_receipt_prompt(known_categories)], config
            )
        except Exception as exc:
            log.error("Gemini vision error: %s", exc)
            return empty_receipt(fallback=True)
        return coerce_receipt(parse_response(raw))

    async def _generate(
        self, model: str, contents: Any, config: types.GenerateContentConfig
    ) -> str:
        """Texte généré ; un seul nouvel essai sur erreur passagère de Google."""
        client = await self._client()
        try:
            response = await client.aio.models.generate_content(
                model=model, contents=contents, config=config
            )
        except errors.ServerError as exc:
            if exc.code not in _RETRYABLE:
                raise
            log.warning("Gemini %s indisponible (%s), nouvel essai", model, exc.code)
            await asyncio.sleep(self.RETRY_DELAY)
            response = await client.aio.models.generate_content(
                model=model, contents=contents, config=config
            )
        usage = response.usage_metadata
        if usage is not None:
            log.info(
                "gemini_usage model=%s prompt=%s output=%s",
                model, usage.prompt_token_count, usage.candidates_token_count,
            )
        return response.text or ""

    async def _client(self) -> genai.Client:
        api_key = await settings_store.get("gemini_api_key")
        if not api_key:
            raise RuntimeError(
                "Clé API Gemini absente (backoffice › Configuration, ou GEMINI_API_KEY)"
            )
        if self._client_instance is None or api_key != self._client_key:
            self._client_instance = genai.Client(
                api_key=api_key,
                http_options=types.HttpOptions(timeout=int(self._timeout * 1000)),
            )
            self._client_key = api_key
        return self._client_instance

