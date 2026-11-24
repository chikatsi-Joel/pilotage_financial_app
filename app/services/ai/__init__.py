"""Services IA : analyse financière du mois et lecture des tickets de caisse.

- `base`        contrat `AIProvider` et réglages de génération partagés
- `prompts`     prompts système et contexte compact envoyé au modèle
- `validation`  lecture du JSON, contrôle des nombres cités, analyse de secours
- `receipts`    normalisation d'un ticket lu
- `ollama_provider`, `gemini_provider`  un fichier par fournisseur
- `factory`     choix du fournisseur (AI_PROVIDER)
"""

from app.services.ai.base import MAX_OUTPUT_TOKENS, PROMPT_VERSION, AIProvider
from app.services.ai.factory import get_provider, reset_provider
from app.services.ai.gemini_provider import GeminiProvider
from app.services.ai.ollama_provider import OllamaProvider
from app.services.ai.prompts import SYSTEM_PROMPT
from app.services.ai.validation import validate_llm_output

__all__ = [
    "MAX_OUTPUT_TOKENS",
    "PROMPT_VERSION",
    "SYSTEM_PROMPT",
    "AIProvider",
    "GeminiProvider",
    "OllamaProvider",
    "get_provider",
    "reset_provider",
    "validate_llm_output",
]
