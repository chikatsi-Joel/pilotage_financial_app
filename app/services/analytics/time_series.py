from __future__ import annotations

from typing import Any

import numpy as np
import ruptures as rpt

from app.services.analytics.statistics import mad, robust_center, robust_z

# Sentinelle : « ajustement STL non fourni, le calculer ». None signifie « pas assez de données ».
_UNSET: Any = object()

# STL thresholds:
# - >= 24 months: full STL with seasonal component
# - 12-24 months: fallback to robust_baseline + trend only
# - < 12 months: no decomposition at all
_MIN_SEASONAL = 24
_MIN_TREND = 12

# Plancher de dispersion, relatif au niveau habituel de la série : un écart de moins de ~5 %
# du niveau n'est jamais « hors norme », même si l'historique est parfaitement régulier
# (évite les z gigantesques sur des résidus STL quasi nuls).
_MIN_RELATIVE_SCALE = 0.05


def _scale_floor(values: list[float]) -> float:
    return _MIN_RELATIVE_SCALE * abs(robust_center([float(v) for v in values]))


def stl(values: list[float], period: int = 12):
    """Décomposition STL, ou None sous 24 mois d'historique.

    statsmodels (et pandas) n'est importé qu'au premier besoin : la plupart des utilisateurs
    n'ont pas 24 mois d'historique, l'API démarre plus vite et consomme moins de mémoire.
    """
    if len(values) < max(2 * period, _MIN_SEASONAL):
        return None
    from statsmodels.tsa.seasonal import STL

    return STL(
        np.asarray(values, float), period=period, robust=True
    ).fit()


def seasonality_strength(
    values: list[float], period: int = 12, *, fit: Any = _UNSET
) -> tuple[float, bool]:
    """
    Returns (strength, reliable).

    reliable=True only when we have >= 2*period observations,
    meaning STL had enough data to estimate seasonality.
    """
    if len(values) < max(2 * period, _MIN_SEASONAL):
        return 0.0, False
    r = stl(values, period) if fit is _UNSET else fit
    if r is None:
        return 0.0, False
    resid = np.asarray(r.resid)
    combined = resid + np.asarray(r.seasonal)
    den = np.var(combined)
    # Série quasi constante : saisonnier et résidus sont du bruit d'arrondi, leur rapport n'a
    # pas de sens (il pouvait afficher une « forte saisonnalité » sur un loyer fixe).
    if den <= _scale_floor(values) ** 2:
        return 0.0, True
    strength = float(np.clip(1 - np.var(resid) / den, 0, 1))
    return strength, True


def detect_change_points(
    values: list[float], penalty: float | None = None
) -> tuple[int, ...]:
    if len(values) < 8:
        return ()
    signal = np.asarray(values, float).reshape(-1, 1)
    model = rpt.Pelt(model="l1", min_size=2, jump=1)
    penalty = (
        max(mad(values), 1.0) * 3
        if penalty is None
        else penalty
    )
    return tuple(
        int(x)
        for x in model.fit(signal).predict(pen=penalty)
        if x < len(values)
    )


def drift_score(values: list[float]) -> float:
    """Dérive À LA HAUSSE du niveau habituel, dans [0, 1].

    Compare les médianes des deux moitiés de l'historique. Seule une hausse compte : pour des
    dépenses, un niveau qui baisse durablement est un progrès (épargne), pas une dérive.
    """
    if len(values) < 6:
        return 0.0
    m = len(values) // 2
    a = robust_center(values[:m])
    b = robust_center(values[m:])
    s = mad(values)
    return (
        0.0 if s == 0
        else float(np.clip((b - a) / (3 * s), 0, 1))
    )


def residual_anomaly_score(
    values: list[float], period: int = 12, *, fit: Any = _UNSET
) -> float:
    """Anomalie À LA HAUSSE du dernier mois (z robuste modifié, 0 si en dessous de l'habitude).

    Un dernier mois anormalement BAS est une bonne nouvelle pour l'épargne : il ne compte pas
    comme anomalie (ni dans le score d'opportunité). `fit` : ajustement STL déjà calculé sur
    `values` (évite un second ajustement).
    """
    r = stl(values, period) if fit is _UNSET else fit
    if r is None:
        if len(values) < 3:
            return 0.0
        return max(0.0, robust_z(values[-1], values[:-1], _scale_floor(values[:-1])))
    residuals = np.asarray(r.resid)
    return max(
        0.0,
        robust_z(float(residuals[-1]), residuals[:-1].tolist(), _scale_floor(values)),
    )
