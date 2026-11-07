"""Erreurs métier partagées par tous les services.

Chaque erreur porte le statut HTTP qui lui correspond ; un unique handler
(`app.api.errors`) les traduit en réponses, ce qui évite un `try/except`
par route.
"""

from __future__ import annotations


class ServiceError(Exception):
    """Base des erreurs métier ; `status_code` est le statut HTTP associé."""

    status_code: int = 400


class NotFound(ServiceError):
    status_code = 404


class Conflict(ServiceError):
    status_code = 409


class BusinessRule(ServiceError):
    status_code = 422


class InvalidPeriod(BusinessRule):
    """La période n'est pas au format YYYY-MM."""


class InvalidEnum(BusinessRule):
    """Valeur d'énumération inconnue."""


class InvalidImage(BusinessRule):
    """Image de reçu vide ou de type non supporté."""
