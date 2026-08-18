from __future__ import annotations

from statistics import median


def mad(values: list[float]) -> float:
    if not values:
        return 0.0
    c = median(values)
    return float(median(abs(float(x) - c) for x in values))


def robust_center(values: list[float]) -> float:
    return float(median(values)) if values else 0.0


def ewma(values: list[float], alpha: float = 0.30) -> float:
    if not values:
        return 0.0
    r = float(values[0])
    for v in values[1:]:
        r = alpha * float(v) + (1 - alpha) * r
    return r


def robust_baseline(values: list[float], alpha: float = 0.30) -> float:
    if not values:
        return 0.0
    c = robust_center(values)
    s = mad(values)
    if s == 0:
        return ewma(values, alpha)
    filtered = [x for x in values if abs(x - c) <= 3.5 * s]
    return ewma(filtered or list(values), alpha)


def theil_sen_trend(values: list[float]) -> float:
    import numpy as np
    from scipy.stats import theilslopes

    if len(values) < 3:
        return 0.0
    slope, *_ = theilslopes(np.asarray(values, float), np.arange(len(values), dtype=float),)
    return float(slope / max(abs(float(np.median(values))), 1e-9))


def robust_z(value: float, reference: list[float]) -> float:
    if len(reference) < 3:
        return 0.0
    c = robust_center(reference)
    s = mad(reference)
    return 0.0 if s == 0 else float(0.6745 * (value - c) / s)


def confidence(n: int) -> float:
    return min(n / 12.0, 1.0)
