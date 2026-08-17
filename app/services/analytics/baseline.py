import numpy as np


def calculate_ewma(
        values: list[float],
        alpha: float = 0.3,
) -> float:

    if not values:
        return 0.0

    result = values[0]

    for value in values[1:]:
        result = (
                alpha * value
                + (1 - alpha) * result
        )

    return result


def calculate_robust_baseline(
        values: list[float],
        alpha: float = 0.3,
) -> float:

    if not values:
        return 0.0

    median = float(np.median(values))

    deviations = [
        abs(value - median)
        for value in values
    ]

    mad = float(np.median(deviations))

    if mad == 0:
        return calculate_ewma(values, alpha)

    filtered = [
        value
        for value in values
        if abs(value - median) <= 3 * mad
    ]

    return calculate_ewma(filtered, alpha)