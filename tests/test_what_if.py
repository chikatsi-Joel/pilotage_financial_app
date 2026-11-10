from decimal import Decimal

from app.services.what_if import reference_amount, simulate_what_if


def test_what_if_matches_spec_example():
    result = simulate_what_if(Decimal("87000"), Decimal("20"), Decimal("800000"), Decimal("500000"))
    assert result["new_target"] == Decimal("69600.00")
    assert result["monthly_saving"] == Decimal("17400.00")
    assert result["annual_saving"] == Decimal("208800.00")


def test_reference_uses_habitual_level_early_in_the_month():
    amount, basis = reference_amount(Decimal("5000"), [Decimal("30000"), Decimal("0"), Decimal("36000")])
    assert amount == Decimal("33000.00")
    assert basis == "habituel"


def test_reference_keeps_current_month_when_already_higher():
    amount, basis = reference_amount(Decimal("50000"), [Decimal("30000")])
    assert amount == Decimal("50000.00")
    assert basis == "mois_en_cours"


def test_reference_without_history_uses_current_month():
    amount, basis = reference_amount(Decimal("12000"), [Decimal("0"), Decimal("0")])
    assert amount == Decimal("12000.00")
    assert basis == "mois_en_cours"
