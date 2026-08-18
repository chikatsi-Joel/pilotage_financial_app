from __future__ import annotations

import numpy as np
import ruptures as rpt
from statsmodels.tsa.seasonal import STL

from app.services.analytics.statistics import mad, robust_center, robust_z

# STL thresholds:
# - >= 24 months: full STL with seasonal component
# - 12-24 months: fallback to robust_baseline + trend only
# - < 12 months: no decomposition at all
_MIN_SEASONAL = 24
_MIN_TREND = 12


def stl(values: list[float], period: int = 12):
    if len(values) < max(2 * period, _MIN_SEASONAL):
        return None
    return STL(
        np.asarray(values, float), period=period, robust=True
    ).fit()


def seasonality_strength(
    values: list[float], period: int = 12
) -> tuple[float, bool]:
    """
    Returns (strength, reliable).

    reliable=True only when we have >= 2*period observations,
    meaning STL had enough data to estimate seasonality.
    """
    if len(values) < max(2 * period, _MIN_SEASONAL):
        return 0.0, False
    r = stl(values, period)
    if r is None:
        return 0.0, False
    resid = np.asarray(r.resid)
    combined = resid + np.asarray(r.seasonal)
    den = np.var(combined)
    strength = (
        0.0 if den == 0
        else float(np.clip(1 - np.var(resid) / den, 0, 1))
    )
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
    if len(values) < 6:
        return 0.0
    m = len(values) // 2
    a = robust_center(values[:m])
    b = robust_center(values[m:])
    s = mad(values)
    return (
        0.0 if s == 0
        else float(np.clip(abs(b - a) / (3 * s), 0, 1))
    )


def residual_anomaly_score(
    values: list[float], period: int = 12
) -> float:
    r = stl(values, period)
    if r is None:
        if len(values) < 3:
            return 0.0
        return abs(robust_z(values[-1], values[:-1]))
    residuals = np.asarray(r.resid)
    return abs(
        robust_z(float(residuals[-1]), residuals[:-1].tolist())
    )
