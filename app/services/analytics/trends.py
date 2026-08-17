import numpy as np
from scipy.stats import theilslopes


def calculate_trend(values: list[float],) -> float:

    if len(values) < 3: return 0.0

    x = np.arange(len(values))

    slope, _, _, _ = theilslopes(values, x, )

    mean = np.mean(values)

    if mean == 0: return 0.0

    return float(slope / mean)