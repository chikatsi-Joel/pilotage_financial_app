
def calculate_opportunity_score(
        variation: float,
        potential: float,
        essential: bool,
        confidence: float,
        financial_impact: float,) -> float:

    if essential:
        essential_factor = 0.25
    else:
        essential_factor = 1.0

    score = (abs(variation) * potential * essential_factor * confidence * financial_impact)

    return max(0.0, min(score, 1.0), )