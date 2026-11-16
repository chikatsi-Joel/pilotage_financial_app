"""Pages publiques exigées par les stores : accessibles sans session, sans ressource externe."""

import httpx
import pytest

from app.main import app


@pytest.mark.parametrize(
    ("path", "needle"),
    [
        ("/confidentialite", "Politique de confidentialité"),
        ("/privacy", "Politique de confidentialité"),
        ("/suppression-compte", "Supprimer mon compte"),
        ("/account-deletion", "Supprimer mon compte"),
    ],
)
async def test_legal_page_is_public(path, needle):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://t"
    ) as c:
        r = await c.get(path)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/html")
    assert "default-src 'none'" in r.headers["content-security-policy"]
    assert needle in r.text
    assert "kappachikatsi@gmail.com" in r.text
    assert "<script" not in r.text and "https://fonts" not in r.text
