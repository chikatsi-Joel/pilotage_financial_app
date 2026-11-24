"""Choix du fournisseur IA par la variable d'environnement AI_PROVIDER."""

from __future__ import annotations

import logging

from app.core.config import settings
from app.services.ai.base import AIProvider
from app.services.ai.gemini_provider import GeminiProvider
from app.services.ai.ollama_provider import OllamaProvider

log = logging.getLogger(__name__)

_PROVIDERS: dict[str, type[GeminiProvider] | type[OllamaProvider]] = {
    "gemini": GeminiProvider,
    "ollama": OllamaProvider,
}
DEFAULT_PROVIDER = "ollama"

_instance: AIProvider | None = None


def get_provider() -> AIProvider:
    """Instance partagée du fournisseur choisi ("gemini" ou "ollama", Ollama par défaut)."""
    global _instance
    if _instance is None:
        choice = settings.ai_provider.strip().lower()
        if choice not in _PROVIDERS:
            log.warning("AI_PROVIDER=%r inconnu : %s utilisé", choice, DEFAULT_PROVIDER)
            choice = DEFAULT_PROVIDER
        _instance = _PROVIDERS[choice]()
        log.info("Fournisseur IA : %s", _instance.name)
    return _instance


def reset_provider() -> None:
    """Oublie l'instance (tests, changement de configuration)."""
    global _instance
    _instance = None
