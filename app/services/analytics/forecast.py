"""Prévision mensuelle d'une catégorie, sur la série CALENDAIRE (mois sans dépense = 0).

Principes (voir `forecast_calendar`) :

1. Catégories ponctuelles : prévision = probabilité d'utilisation × montant quand la catégorie
   est utilisée (décomposition de Croston). Une dépense trimestrielle de 30 000 vaut ainsi
   ~10 000 par mois en espérance, et non 30 000.
2. Évaluation honnête : à chaque mois passé (origine t), chaque méthode prédit le mois t à
   partir des seuls mois < t. Le CHOIX de la méthode à l'origine t n'utilise lui aussi que les
   erreurs des origines < t : l'erreur rapportée est celle de toute la procédure, hors
   échantillon, et non celle de la méthode retenue a posteriori (qui serait optimiste).
3. Fourchette à 80 % : bornes conformes (rangs ⌈(n+1)·q⌉) sur les 12 dernières erreurs
   honnêtes, qui corrigent la sous-couverture des quantiles empiriques sur petit échantillon.
   Rien n'est supposé sur la loi des erreurs. La garantie suppose des erreurs échangeables :
   la fenêtre récente limite la dérive quand le niveau change (couverture mesurée ≈ 0,75
   sous hausse continue ou saut de niveau, ≥ 0,8 en régime stable : tests/test_forecast.py).
   Publiée seulement avec au moins 9 erreurs (≈ 12 mois).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from app.services.analytics.statistics import ewma

# Couverture nominale de la fourchette et quantiles correspondants.
COVERAGE = 0.80
_Q_LOW, _Q_HIGH = (1 - COVERAGE) / 2, 1 - (1 - COVERAGE) / 2
# Première origine de backtest : au moins 3 mois observés avant de prédire.
_FIRST_ORIGIN = 3
# Erreurs honnêtes minimales pour publier une MAE (3) puis une fourchette conforme (9 : il
# faut ⌈(n+1)·0,9⌉ ≤ n).
_MIN_ERRORS_MAE = 3
_MIN_ERRORS_INTERVAL = 9
# Méthode par défaut tant qu'aucune erreur passée ne permet de choisir.
_DEFAULT = "ewma"
# Erreurs minimales pour qu'une méthode soit comparée (choix en cours de route et final).
_MIN_SCORED = 2
# Erreurs minimales de la saisonnière avant de la comparer aux autres méthodes.
_MIN_SEASONAL_SCORED = 6
# Fenêtre récente : taux d'usage (adaptatif : un abonnement résilié cesse d'être prévu) et
# erreurs servant aux bornes conformes (les erreurs anciennes, faites à un autre niveau de
# dépense, ne doivent pas peser autant que les récentes).
_RECENT = 12
# Mois observés après l'ancrage nécessaires pour l'estimateur sans biais du taux d'usage.
_MIN_RATE_MONTHS = 3


def predict(values: list[float], method: str, period: int = 12) -> float:
    """Montant suivant d'une série (sans zéros), selon `method`."""
    if method == "naive":
        return float(values[-1])
    if method == "ewma":
        return ewma(values)
    if method == "trend":
        if len(values) < 2:
            return float(values[-1])
        x = np.arange(len(values), dtype=float)
        y = np.asarray(values, float)
        s, i = np.polyfit(x, y, 1)
        return max(0.0, float(i + s * len(values)))
    if method == "seasonal_naive":
        return float(values[-period]) if len(values) >= period else float(values[-1])
    raise ValueError(method)


def _predict_calendar(prefix: list[float], method: str, period: int) -> float:
    """Espérance du mois suivant `prefix` (série calendaire, zéros compris)."""
    if method == "seasonal_naive":
        # Même mois l'an dernier, directement sur le calendrier (zéro compris).
        return float(prefix[-period])
    used = [v for v in prefix if v > 0]
    if not used:
        return 0.0
    rate = usage_rate(prefix)
    return rate * predict(used, method, period) if rate > 0 else 0.0


def usage_rate(calendar: list[float]) -> float:
    """Probabilité qu'un mois soit utilisé, estimée sans biais.

    La série commence par construction à la première dépense : ce mois d'ancrage est toujours
    « utilisé » et biaiserait k/n vers le haut ((1 + (n−1)p)/n en espérance). On l'exclut :
    (k − 1)/(n − 1). Au-delà de 12 mois, seuls les 12 derniers comptent (ils ne contiennent
    plus l'ancrage) : le taux suit un changement d'habitude.
    """
    n = len(calendar)
    if n == 0:
        return 0.0
    if n == 1:
        return 1.0 if calendar[0] > 0 else 0.0
    k = sum(1 for v in calendar if v > 0)
    if n > _RECENT:
        return sum(1 for v in calendar[-_RECENT:] if v > 0) / _RECENT
    if n - 1 < _MIN_RATE_MONTHS:
        # Moins de 3 mois après l'ancrage : (k−1)/(n−1) serait sans biais mais très instable
        # (0 après un seul mois vide). On garde k/n, prudent (légère surestimation).
        return k / n
    return (k - 1) / (n - 1)


def _best(errors: dict[str, list[float]]) -> str:
    """Méthode à la plus faible MAE, comparée sur les MÊMES origines (les plus récentes
    communes) : une méthode notée seulement sur des origines tardives, plus faciles, n'est pas
    avantagée."""
    scored = {m: e for m, e in errors.items() if len(e) >= _MIN_SCORED}
    # La saisonnière n'arrive qu'à 24 mois : tant qu'elle a peu d'erreurs, l'inclure ramènerait
    # la comparaison de TOUTES les méthodes à ces quelques origines communes (choix instable).
    if len(scored.get("seasonal_naive", [])) < _MIN_SEASONAL_SCORED:
        scored.pop("seasonal_naive", None)
    if not scored:
        return _DEFAULT
    common = min(len(e) for e in scored.values())
    return min(scored, key=lambda m: float(np.mean(np.abs(scored[m][-common:]))))


def _methods(n: int, period: int) -> list[str]:
    methods = ["naive", "ewma", "trend"]
    if n >= 2 * period:
        methods.append("seasonal_naive")
    return methods


@dataclass(frozen=True)
class ForecastResult:
    """Prévision du mois suivant la série.

    `value` : espérance du montant du mois (probabilité d'utilisation incluse) ;
    `mae` : erreur absolue moyenne hors échantillon de la procédure (None si trop peu de mois) ;
    `low`/`high` : fourchette à COVERAGE (None si trop peu d'erreurs observées) ;
    `usage_rate` : probabilité d'utilisation d'un mois (voir `usage_rate`).
    """

    method: str
    value: float
    mae: float | None
    low: float | None
    high: float | None
    usage_rate: float


def backtest(calendar: list[float], period: int = 12) -> tuple[dict[str, list[float]], list[float]]:
    """Erreurs (réel − prévu) de chaque méthode et de la procédure de choix, origine par origine.

    À l'origine t, seules les valeurs < t servent, y compris pour choisir la méthode : les
    erreurs `honest` d'une série tronquée sont exactement le début de celles de la série
    complète (aucune information future).
    """
    n = len(calendar)
    errors: dict[str, list[float]] = {m: [] for m in _methods(n, period)}
    honest: list[float] = []
    for t in range(_FIRST_ORIGIN, n):
        prefix = calendar[:t]
        candidates = _methods(t, period)
        chosen = _best({m: errors[m] for m in candidates})
        actual = calendar[t]
        for m in candidates:
            errors[m].append(actual - _predict_calendar(prefix, m, period))
        honest.append(actual - _predict_calendar(prefix, chosen, period))
    return errors, honest


def forecast_calendar(calendar: list[float], period: int = 12) -> ForecastResult:
    """Prévision du mois qui suit `calendar` (totaux mensuels consécutifs, 0 si inutilisée)."""
    n = len(calendar)
    used = [v for v in calendar if v > 0]
    if n == 0 or not used:
        return ForecastResult("naive", 0.0, None, None, None, 0.0)
    rate = usage_rate(calendar)

    errors, honest = backtest(calendar, period)
    method = _best(errors)
    value = max(0.0, _predict_calendar(calendar, method, period))
    mae = float(np.mean(np.abs(honest))) if len(honest) >= _MIN_ERRORS_MAE else None

    low = high = None
    # Erreurs récentes seulement (au moins 9 requises) : voir _RECENT.
    bounds = conformal_bounds(honest[-_RECENT:])
    if bounds is not None:
        # Bornes autour de la valeur prévue (jamais négatives, toujours de part et d'autre).
        low = max(0.0, min(value, value + bounds[0]))
        high = max(value, value + bounds[1])
    return ForecastResult(method, value, mae, low, high, rate)


def conformal_bounds(errors: list[float]) -> tuple[float, float] | None:
    """Bornes d'erreur à COVERAGE : rangs ⌈(n+1)·q⌉ des erreurs triées (méthode conforme).

    Contrairement aux quantiles empiriques, la couverture reste ≥ nominale sur petit
    échantillon (sous échangeabilité des erreurs). None si n est trop petit pour l'assurer.
    """
    n = len(errors)
    if n < _MIN_ERRORS_INTERVAL:
        return None
    ordered = sorted(errors)
    k_high = math.ceil((n + 1) * _Q_HIGH)
    k_low = n + 1 - k_high
    if k_high > n or k_low < 1:
        return None
    return float(ordered[k_low - 1]), float(ordered[k_high - 1])


def forecast(values: list[float], period: int = 12) -> tuple[str, float, float | None]:
    """Compatibilité : prévision d'une série sans zéros (chaque mois utilisé)."""
    r = forecast_calendar(values, period)
    return r.method, r.value, r.mae
