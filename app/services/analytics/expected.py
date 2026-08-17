
def calculate_expected_spending(baseline: float, trend: float,
                                seasonal_component: float = 0.0,) -> float:

    return max( baseline * (1 + trend) + seasonal_component, 0.0,)