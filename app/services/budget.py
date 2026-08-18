from __future__ import annotations

from decimal import Decimal

from app.schemas.common import BudgetCategoryLine, BudgetRead
from app.services.analytics import money


def generate_budget(
    period: str,
    projected_income: Decimal,
    current_expenses: Decimal,
    current_savings: Decimal,
    target_savings: Decimal | None,
    category_inputs: list[dict],
) -> BudgetRead:
    lines: list[BudgetCategoryLine] = []
    potential = Decimal("0")

    for item in category_inputs:
        current = money(item["current_amount"])
        baseline = item["baseline_amount"]
        essential = bool(item["essential"])
        variation = item["variation_percentage"]

        if essential:
            proposed = max(current, Decimal(str(baseline)))
            reason = "Dépense essentielle : aucune réduction automatique."
        else:
            if variation > 20:
                factor = Decimal("0.20")
            elif variation > 10:
                factor = Decimal("0.10")
            else:
                factor = Decimal("0.05")
            basis = Decimal(str(baseline))
            proposed = money(basis * (Decimal("1") - factor))
            proposed = min(proposed, current) if current > 0 else proposed
            reason = (
                f"Réduction de {factor * 100:.0f}% "
                f"fondée sur la variation de {variation:.1f}%."
            )

        reduction = max(Decimal("0"), current - proposed)
        lines.append(BudgetCategoryLine(
            category_id=item["category_id"],
            category_name=item["name"],
            current=current,
            baseline=float(baseline),
            recommended=proposed,
            essential=essential,
            reduction=money(reduction),
            reason=reason,
        ))
        potential += reduction

    recommended_expenses = money(
        sum((x.recommended for x in lines), Decimal("0"))
    )
    available_after_expenses = max(
        Decimal("0"),
        money(projected_income - recommended_expenses),
    )
    recommended_savings = available_after_expenses
    target_gap = money(
        max(
            Decimal("0"),
            (target_savings or Decimal("0"))
            - recommended_savings,
        )
    )

    rationale = (
        "Budget calculé à partir du revenu prévu, "
        "des baselines disponibles, de l'essentialité, "
        "du potentiel d'optimisation et des dérives "
        "détectées. Les catégories essentielles ne sont "
        "pas réduites automatiquement."
    )
    return BudgetRead(
        period=period,
        projected_income=money(projected_income),
        current_expenses=money(current_expenses),
        recommended_expenses=recommended_expenses,
        current_savings=money(current_savings),
        recommended_savings=recommended_savings,
        target_savings=(
            money(target_savings)
            if target_savings is not None
            else None
        ),
        potential_savings=money(potential),
        target_gap=target_gap,
        categories=lines,
        rationale=rationale,
    )
