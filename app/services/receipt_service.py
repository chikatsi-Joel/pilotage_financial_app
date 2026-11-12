from __future__ import annotations

import base64
import logging
from datetime import date
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import category_service
from app.services.ai import OllamaProvider, get_provider
from app.services.errors import InvalidImage

log = logging.getLogger(__name__)


EMPTY_SCAN: dict[str, object] = {
    "amount": None,
    "category": None,
    "expense_date": None,
    "merchant": None,
    "description": None,
    "items": [],
    "fallback": False,
}

_IMAGE_TYPES = ("image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic")


def _match_category(
    proposed: str | None, known: list[str],
) -> str | None:
    """Rapproche la catégorie proposée d'une catégorie réellement enregistrée."""
    if not proposed:
        return None
    needle = proposed.strip().casefold()
    for name in known:
        if name.casefold() == needle:
            return name
    for name in known:
        if needle in name.casefold() or name.casefold() in needle:
            return name
    return None


async def scan_receipt(
    user_id: UUID,
    image_bytes: bytes,
    content_type: str | None,
    db: AsyncSession,
    provider: OllamaProvider | None = None,
) -> dict[str, object]:
    """Analyse un ticket de caisse et renvoie les champs pré-remplissables."""
    if not image_bytes:
        raise InvalidImage("Empty file")

    if content_type:
        if content_type.lower() not in _IMAGE_TYPES:
            raise InvalidImage("Unsupported media type")

    log.info("data scan received : %s", content_type)
    items, _, _ = await category_service.list_by_user(user_id, db, limit=100)
    known = [c.name for c in items if c.active]
    # Fin de la transaction de lecture : la connexion retourne au pool pendant l'appel au
    # modèle de vision (plusieurs secondes), au lieu d'être monopolisée.
    await db.commit()

    if provider is None:
        provider = get_provider()
    if provider is None:
        return {**EMPTY_SCAN, "fallback": True}

    try:
        result = await provider.scan_receipt(
            base64.b64encode(image_bytes).decode("ascii"), known,
        )
        log.info("Result of Ollama: %s", result)
    except Exception:  # noqa: BLE001 - dégrade vers un scan vide, mais journalisé
        log.exception("Receipt scan failed for user %s", user_id)
        return {**EMPTY_SCAN, "fallback": True}

    items = [
        {**item, "category": _match_category(item.get("category"), known)}
        for item in result.get("items") or []
    ]

    return {
        "items": items,
        "amount": result.get("amount"),
        "category": _match_category(result.get("category"), known),
        "expense_date": result.get("expense_date") or date.today().isoformat(),
        "merchant": result.get("merchant"),
        "description": result.get("description"),
        "fallback": bool(result.get("fallback")),
    }
