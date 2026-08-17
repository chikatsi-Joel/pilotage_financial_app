from decimal import Decimal
from app.services.analytics import money


def simulate_what_if(current_amount: Decimal, reduction_percent: Decimal, current_income: Decimal | None = None, current_expenses: Decimal | None = None) -> dict:
    new_target = money(current_amount * (Decimal("1") - reduction_percent / Decimal("100")))
    saving = money(current_amount - new_target)
    rate = None
    if current_income and current_income > 0 and current_expenses is not None:
        projected_expenses = max(Decimal("0"), current_expenses - saving)
        rate = money((current_income - projected_expenses) / current_income)
    return {
        "new_target": new_target,
        "monthly_saving": saving,
        "annual_saving": money(saving * Decimal("12")),
        "projected_savings_rate": rate,
    }
