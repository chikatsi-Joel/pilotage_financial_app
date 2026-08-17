import numpy as np


def robust_z_score(values: list[float], current: float,) -> float:

    if len(values) < 3:
        return 0.0

    median = np.median(values)

    mad = np.median(np.abs(np.array(values) - median))

    if mad == 0:
        return 0.0

    return float(0.6745 * (current - median) / mad)