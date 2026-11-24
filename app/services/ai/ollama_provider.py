"""Fournisseur Ollama (ollama.com ou serveur auto-hébergé)."""

from __future__ import annotations

import logging
from typing import Any

import ollama

from app.core.config import settings
from app.services import settings_store
from app.services.ai.base import ANALYSIS_TEMPERATURE, MAX_OUTPUT_TOKENS, RECEIPT_TEMPERATURE
from app.services.ai.prompts import (
    RECEIPT_SYSTEM_PROMPT,
    SYSTEM_PROMPT,
    build_prompt,
    build_receipt_prompt,
)
from app.services.ai.receipts import coerce_receipt, empty_receipt
from app.services.ai.validation import fallback_analysis, parse_response, validate_llm_output

log = logging.getLogger(__name__)


class OllamaProvider:
    """Analyse et lecture de tickets via l'API chat d'Ollama. URL, modèle et clé sont relus
    dans la configuration (backoffice, sinon .env) à chaque appel."""

    name = "ollama"

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float | None = None,
    ) -> None:
        self._base_url_override = base_url
        self._model_override = model
        self._timeout = timeout or settings.ollama_timeout

    async def base_url(self) -> str:
        return self._base_url_override or await settings_store.get("ollama_base_url")

    async def model(self) -> str:
        return self._model_override or await settings_store.get("ollama_model")

    async def vision_model(self) -> str:
        return await settings_store.get("ollama_vision_model") or await self.model()

    async def complete_json(
        self, system_prompt: str, user_prompt: str, *, max_output_tokens: int = MAX_OUTPUT_TOKENS
    ) -> str:
        """Réponse JSON brute du modèle ; lève en cas d'échec (voir `describe_error`)."""
        return await self._chat(
            await self.model(),
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            {"temperature": ANALYSIS_TEMPERATURE, "num_predict": max_output_tokens},
        )

    def describe_error(self, exc: Exception) -> str:
        """Message lisible pour l'utilisateur ; le détail brut reste dans les logs."""
        if getattr(exc, "status_code", None) in (401, 403):
            return (
                "Clé API Ollama absente ou invalide (backoffice › Configuration, ou OLLAMA_API_KEY)"
            )
        return str(exc)

    async def analyze(self, structured_context: dict[str, Any]) -> dict[str, Any]:
        """Analyse du mois ; analyse de secours si Ollama échoue."""
        try:
            raw = await self.complete_json(SYSTEM_PROMPT, build_prompt(structured_context))
        except Exception as exc:
            log.error("Ollama error: %s", exc)
            return fallback_analysis(structured_context, self.describe_error(exc))
        result = parse_response(raw)
        log.debug("ai result : %s", result)  # contenu financier : pas en INFO
        return validate_llm_output(result, structured_context)

    async def scan_receipt(self, image_b64: str, known_categories: list[str]) -> dict[str, Any]:
        """Champs d'un ticket ; ticket vide (`fallback`) si Ollama échoue."""
        try:
            raw = await self._chat(
                await self.vision_model(),
                [
                    {"role": "system", "content": RECEIPT_SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": build_receipt_prompt(known_categories),
                        "images": [image_b64],
                    },
                ],
                {"temperature": RECEIPT_TEMPERATURE},
            )
        except Exception as exc:
            log.error("Ollama vision error: %s", exc)
            return empty_receipt(fallback=True)
        return coerce_receipt(parse_response(raw))

    async def _chat(
        self, model: str, messages: list[dict[str, Any]], options: dict[str, Any]
    ) -> str:
        client = self._get_client(await self.base_url(), await settings_store.get("ollama_api_key"))
        # Réponse en JSON : courte, et chaque jeton généré est facturé.
        response = await client.chat(model=model, messages=messages, format="json", options=options)
        return response["message"]["content"]

    def _get_client(self, base_url: str, api_key: str) -> ollama.AsyncClient:
        headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
        return ollama.AsyncClient(host=base_url, timeout=self._timeout, headers=headers)
