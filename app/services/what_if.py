from decimal import Decimal

from app.services.analytics import money

BASIS_HABITUAL = "habituel"
BASIS_CURRENT = "mois_en_cours"


def reference_amount(current_amount: Decimal, history: list[Decimal]) -> tuple[Decimal, str]:
    """Montant mensuel sur lequel appliquer la réduction.

    ``history`` contient les dépenses des mois précédents de la catégorie. La moyenne des mois
    non nuls donne le niveau habituel ; le mois en cours n'est retenu que s'il le dépasse déjà.
    Sans historique, on garde le mois en cours.
    """
    spent = [m for m in history if m > 0]
    if not spent:
        return money(current_amount), BASIS_CURRENT
    habitual = money(sum(spent, Decimal("0")) / len(spent))
    if current_amount > habitual:
        return money(current_amount), BASIS_CURRENT
    return habitual, BASIS_HABITUAL


def simulate_what_if(current_amount: Decimal, reduction_percent: Decimal,
    current_income: Decimal | None = None, current_expenses: Decimal | None = None,
) -> dict:
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
