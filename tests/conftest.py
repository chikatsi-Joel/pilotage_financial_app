"""Réglages communs des tests."""

import pytest

from app.services import settings_store

REAL_HYDRATE = settings_store._hydrate


@pytest.fixture(autouse=True)
def _settings_without_database(monkeypatch):
    """Par défaut, la configuration en base est vide : les valeurs viennent de l'environnement.

    Évite qu'un test touche la vraie base (cache paresseux de settings_store). Les tests du
    backoffice réactivent la lecture sur leur base SQLite.
    """

    async def no_database(key: str) -> None:
        settings_store._cache[key] = None
        return None

    monkeypatch.setattr(settings_store, "_hydrate", no_database)
    settings_store._cache.clear()
    yield
    settings_store._cache.clear()
