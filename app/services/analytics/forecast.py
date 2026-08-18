from __future__ import annotations

import numpy as np

from app.services.analytics.statistics import ewma


def predict(
    values: list[float], method: str, period: int = 12
) -> float:
    if method == "naive":
        return float(values[-1])
    if method == "ewma":
        return ewma(values)
    if method == "trend":
        x = np.arange(len(values), dtype=float)
        y = np.asarray(values, float)
        s, i = np.polyfit(x, y, 1)
        return max(0.0, float(i + s * len(values)))
    if method == "seasonal_naive":
        return (
            float(values[-period])
            if len(values) >= period
            else float(values[-1])
        )
    raise ValueError(method)


def score(
    values: list[float], method: str, period: int = 12
) -> float | None:
    if len(values) < 5:
        return None
    actual = []
    pred = []
    for i in range(3, len(values)):
        actual.append(values[i])
        pred.append(predict(values[:i], method, period))
    return float(
        np.mean(np.abs(np.asarray(actual) - np.asarray(pred)))
    )


def forecast(
    values: list[float], period: int = 12
) -> tuple[str, float, float | None]:
    methods = ["naive", "ewma", "trend"]
    if len(values) >= 2 * period:
        methods.append("seasonal_naive")
    scores = {
        m: score(values, m, period) for m in methods
    }
    valid = {k: v for k, v in scores.items() if v is not None}
    method = (
        min(valid, key=valid.get) if valid else "naive"
    )
    return method, predict(values, method, period), valid.get(
        method
    )
