import numpy as np


def calculate_cusum(values: list[float], threshold: float = 5.0,) -> float:

    if len(values) < 4: return 0.0

    mean = np.mean(values)

    std = np.std(values)

    if std == 0: return 0.0

    normalized = [(value - mean) / std for value in values]

    positive = 0.0
    negative = 0.0

    maximum = 0.0

    for value in normalized:

        positive = max(0.0, positive + value,)
        negative = min(0.0, negative + value,)
        maximum = max(maximum, abs(positive), abs(negative),)

    return float( min(maximum / threshold, 1.0))