"""Lecture de ticket : normalisation de la réponse du modèle (schéma ReceiptScanRead)."""

from __future__ import annotations

from datetime import date
from typing import Any

RECEIPT_FIELDS = ("amount", "category", "expense_date", "merchant", "description")
MAX_RECEIPT_ITEMS = 50


def empty_receipt(fallback: bool = False) -> dict[str, Any]:
    """Ticket sans aucun champ lu ; `fallback` : le modèle n'a pas pu être appelé."""
    return dict.fromkeys(RECEIPT_FIELDS, None) | {"items": [], "fallback": fallback}


def coerce_receipt(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalise la sortie du modèle : montants positifs, date ISO, textes non vides."""
    return {
        "items": _coerce_items(raw.get("items")),
        "amount": _positive_amount(raw.get("amount")),
        "category": _clean_text(raw.get("category")),
        "expense_date": _iso_date(raw.get("expense_date")),
        "merchant": _clean_text(raw.get("merchant")),
        "description": _clean_text(raw.get("description")),
        "fallback": False,
    }


def image_mime(image_b64: str) -> str:
    """Type de l'image d'après sa signature (base64) ; JPEG par défaut."""
    head = image_b64[:12]
    if head.startswith("iVBOR"):
        return "image/png"
    if head.startswith("UklGR"):
        return "image/webp"
    if head.startswith("AAAA"):  # conteneur ISO (HEIC/HEIF)
        return "image/heic"
    return "image/jpeg"


def _coerce_items(raw_items: Any) -> list[dict[str, Any]]:
    """Garde uniquement les lignes exploitables (libellé + montant > 0)."""
    if not isinstance(raw_items, list):
        return []
    items: list[dict[str, Any]] = []
    for entry in raw_items[:MAX_RECEIPT_ITEMS]:
        if not isinstance(entry, dict):
            continue
        amount = _positive_amount(entry.get("amount"))
        label = _clean_text(entry.get("label"))
        if label and amount is not None:
            category = _clean_text(entry.get("category"))
            items.append({"label": label, "amount": amount, "category": category})
    return items


def _positive_amount(value: Any) -> float | None:
    if isinstance(value, str):
        value = value.replace(",", ".")
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return None
    return amount if amount > 0 else None


def _iso_date(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    candidate = value.strip()[:10]
    try:
        date.fromisoformat(candidate)
    except ValueError:
        return None
    return candidate


def _clean_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    return value.strip() or None
