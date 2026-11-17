from __future__ import annotations

from statistics import median


def mad(values: list[float]) -> float:
    if not values:
        return 0.0
    c = median(values)
    return float(
        median(abs(float(x) - c) for x in values)
    )


def robust_center(values: list[float]) -> float:
    return float(median(values)) if values else 0.0


def robust_relative_dispersion(values: list[float]) -> float:
    if not values:
        return 0.0
    center = robust_center(values)
    if center == 0:
        return 0.0
    return mad(values) / abs(center)


def ewma(values: list[float], alpha: float = 0.30) -> float:
    if not values:
        return 0.0
    result = float(values[0])
    for value in values[1:]:
        result = alpha * float(value) + (1 - alpha) * result
    return result


def robust_baseline(
    values: list[float], alpha: float = 0.30
) -> float:
    if not values:
        return 0.0
    center = robust_center(values)
    scale = mad(values)
    if scale == 0:
        return ewma(values, alpha)
    filtered = [
        value
        for value in values
        if abs(value - center) <= 3.5 * scale
    ]
    return ewma(filtered or list(values), alpha)


def theil_sen_trend(values: list[float]) -> float:
    import numpy as np
    from scipy.stats import theilslopes

    if len(values) < 3:
        return 0.0
    x = np.arange(len(values), dtype=float)
    y = np.asarray(values, dtype=float)
    slope, *_ = theilslopes(y, x)
    center = abs(float(np.median(y)))
    return float(slope / max(center, 1e-9))


def robust_z(value: float, reference: list[float], min_scale: float = 0.0) -> float:
    """z robuste modifié (Iglewicz-Hoaglin). `min_scale` : plancher de la dispersion (MAD).

    Sans plancher, une référence quasi constante (MAD ≈ 1e-12, typiquement des résidus STL)
    transforme un écart insignifiant en z gigantesque : faux « hors norme ».
    """
    if len(reference) < 3:
        return 0.0

    center = robust_center(reference)
    scale = max(mad(reference), min_scale)

    if scale == 0:
        return 0.0

    return float(0.6745 * (value - center) / scale)


def confidence(values: list[float]) -> float:

    if not values:
        return 0.0

    history_factor = min(len(values) / 12, 1.0)
    dispersion = robust_relative_dispersion(values)
    dispersion_factor = 1 / (1 + dispersion)

    return float(history_factor * dispersion_factor)


def forecast_confidence(months: int, mae: float, calendar: list[float]) -> float:
    """Fiabilité dans [0, 1] fondée sur l'erreur de prévision HORS échantillon.

    min(mois/12, 1) / (1 + erreur relative), erreur relative = MAE / montant mensuel moyen
    (zéros compris). Même forme que `confidence`, mais mesurée sur la précision réelle et non
    sur la seule dispersion des montants. Seuils hérités (≥ 0,75 élevée, ≥ 0,25 moyenne) :
    « élevée » exige 12 mois et une erreur relative ≤ 33 %. Une catégorie ponctuelle a une
    erreur relative structurellement forte (mois à 0 ou plein) : confiance basse, c'est voulu.
    """
    mean = sum(calendar) / len(calendar) if calendar else 0.0
    if mean <= 0:
        return 0.0
    history_factor = min(months / 12, 1.0)
    return float(history_factor / (1 + mae / mean))


def relative_gap(current: float, reference: float) -> float:
    """Écart de `current` à `reference`, en %. 0 sans référence (aucun historique)."""
    return (current - reference) / reference * 100 if reference > 0 else 0.0
