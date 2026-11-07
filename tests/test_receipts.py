from __future__ import annotations

from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.services.receipt_service import (
    EMPTY_SCAN,
    InvalidImage,
    _match_category,
    scan_receipt,
)


class _Category:
    def __init__(self, name: str, active: bool = True) -> None:
        self.name = name
        self.active = active


def _patch_categories(names: list[str]):
    return patch(
        "app.services.receipt_service.category_service.list_by_user",
        AsyncMock(return_value=([_Category(n) for n in names], 1, 1)),
    )


def _provider(result: dict):
    provider = AsyncMock()
    provider.scan_receipt = AsyncMock(return_value=result)
    return provider


# ─────────────────────────────────────────────────────────
#  Rapprochement de catégorie
# ─────────────────────────────────────────────────────────


def test_match_category_exact():
    assert _match_category("Alimentation", ["Transport", "Alimentation"]) == (
        "Alimentation"
    )


def test_match_category_partial():
    assert _match_category("aliment", ["Restauration", "Alimentation"]) == (
        "Alimentation"
    )


def test_match_category_unknown_returns_none():
    assert _match_category("Crypto", ["Transport"]) is None
    assert _match_category(None, ["Transport"]) is None


# ─────────────────────────────────────────────────────────
#  scan_receipt
# ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_scan_receipt_rejects_empty_file():
    with pytest.raises(InvalidImage):
        await scan_receipt(uuid4(), b"", "image/png", AsyncMock())


@pytest.mark.asyncio
async def test_scan_receipt_rejects_non_image():
    with pytest.raises(InvalidImage):
        await scan_receipt(uuid4(), b"%PDF-1.4", "application/pdf", AsyncMock())


@pytest.mark.asyncio
async def test_scan_receipt_normalizes_payload():
    provider = _provider({
        "amount": 12500.0,
        "category": "Alimentation",
        "expense_date": None,
        "merchant": "Supermarché Test",
        "description": None,
        "fallback": False,
    })
    with _patch_categories(["Restauration", "Alimentation"]):
        result = await scan_receipt(
            uuid4(), b"img", "image/png", AsyncMock(), provider=provider,
        )

    assert result["amount"] == 12500.0
    assert result["category"] == "Alimentation"
    assert result["merchant"] == "Supermarché Test"
    assert result["expense_date"]  # renseigné par défaut
    assert result["fallback"] is False

    known = provider.scan_receipt.await_args.args[1]
    assert known == ["Restauration", "Alimentation"]


@pytest.mark.asyncio
async def test_scan_receipt_falls_back_when_provider_raises():
    provider = _provider({})
    provider.scan_receipt = AsyncMock(side_effect=RuntimeError("ollama down"))
    with _patch_categories(["Transport"]):
        result = await scan_receipt(
            uuid4(), b"img", "image/jpeg", AsyncMock(), provider=provider,
        )

    assert result == {**EMPTY_SCAN, "fallback": True}


@pytest.mark.asyncio
async def test_scan_receipt_falls_back_when_no_provider():
    with _patch_categories(["Transport"]):
        with patch("app.services.receipt_service.get_provider", return_value=None):
            result = await scan_receipt(uuid4(), b"img", "image/png", AsyncMock())

    assert result == {**EMPTY_SCAN, "fallback": True}
