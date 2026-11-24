"""Contrat commun des fournisseurs IA et réglages de génération partagés."""

from __future__ import annotations

from typing import Any, Protocol

# À incrémenter quand SYSTEM_PROMPT ou build_prompt change de façon significative : les
# analyses enregistrées avec l'ancienne version sont alors régénérées (empreinte différente).
PROMPT_VERSION = 5
# Plafond de la réponse du modèle (≈ 3 alertes + 3 recommandations + résumé).
MAX_OUTPUT_TOKENS = 900
ANALYSIS_TEMPERATURE = 0.3
RECEIPT_TEMPERATURE = 0.1


class AIProvider(Protocol):
    """Fournisseur IA : analyse financière du mois et lecture des tickets de caisse.

    `analyze` et `scan_receipt` ne lèvent jamais d'erreur : en cas d'échec, l'analyse
    déterministe de secours ou un ticket vide (`fallback`). `complete_json` est la brique
    générique (explications ciblées…) : elle lève, l'appelant choisit son repli.
    """

    name: str

    async def model(self) -> str: ...

    async def base_url(self) -> str: ...

    async def complete_json(
        self, system_prompt: str, user_prompt: str, *, max_output_tokens: int = ...
    ) -> str:
        """Réponse JSON brute ; contrairement aux autres méthodes, lève en cas d'échec."""
        ...

    def describe_error(self, exc: Exception) -> str:
        """Message d'échec lisible par l'utilisateur."""
        ...

    async def analyze(self, structured_context: dict[str, Any]) -> dict[str, Any]: ...

    async def scan_receipt(
        self, image_b64: str, known_categories: list[str]
    ) -> dict[str, Any]: ...


async def model_name(provider: Any) -> str:
    """Modèle configuré (entre dans l'empreinte des résultats enregistrés) ; "" si illisible."""
    try:
        return str(await provider.model())[:80]
    except Exception:
        return ""
