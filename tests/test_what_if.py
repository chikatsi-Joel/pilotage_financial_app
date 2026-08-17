from decimal import Decimal

from app.services.what_if import simulate_what_if


def test_what_if_matches_spec_example():
    result = simulate_what_if(Decimal("87000"), Decimal("20"), Decimal("800000"), Decimal("500000"))
    assert result["new_target"] == Decimal("69600.00")
    assert result["monthly_saving"] == Decimal("17400.00")
    assert result["annual_saving"] == Decimal("208800.00")
