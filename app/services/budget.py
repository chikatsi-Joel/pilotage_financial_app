from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.schemas.common import BudgetCategoryLine, BudgetRead
from app.services.analytics import money, reduction_rate


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
        current = money(item["current"])
        baseline = item["baseline"]
        essential = bool(item["essential"])
        deviation = item["deviation"]
        potential_rate = reduction_rate(item["optimization_potential"], deviation, essential)
        basis = money(baseline if baseline is not None else current)
        proposed = max(current, basis) if essential else money(basis * (Decimal("1") - potential_rate))

        proposed = min(proposed, current) if (not essential and current > 0) else proposed
        reduction = max(Decimal("0"), current - proposed)
        reason = "Dépense essentielle : aucune réduction automatique." if essential else (
            f"Réduction déterministe de {potential_rate * 100:.0f}% fondée sur l'optimisabilité et la dérive."
        )
        lines.append(BudgetCategoryLine(
            category_id=item["category_id"], category_name=item["category_name"], current=current,
            baseline=baseline, recommended=proposed, essential=essential, reduction=money(reduction), reason=reason,
        ))
        potential += reduction

    recommended_expenses = money(sum((x.recommended for x in lines), Decimal("0")))
    available_after_expenses = max(Decimal("0"), money(projected_income - recommended_expenses))

    recommended_savings = available_after_expenses
    target_gap = money(max(Decimal("0"), (target_savings or Decimal("0")) - recommended_savings))

    rationale = (
        "Budget calculé à partir du revenu prévu, des baselines disponibles, de l'essentialité, "
        "du potentiel d'optimisation et des dérives détectées. Les catégories essentielles ne sont pas "
        "réduites automatiquement. Chaque réduction est visible dans le détail des lignes."
    )
    return BudgetRead(
        period=period,
        projected_income=money(projected_income),
        current_expenses=money(current_expenses),
        recommended_expenses=recommended_expenses,
        current_savings=money(current_savings),
        recommended_savings=recommended_savings,
        target_savings=money(target_savings) if target_savings is not None else None,
        potential_savings=money(potential),
        target_gap=target_gap,
        categories=lines,
        rationale=rationale,
    )
