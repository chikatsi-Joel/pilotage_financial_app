from decimal import Decimal
from uuid import uuid4

from app.services.budget import generate_budget


def test_budget_does_not_reduce_essentials_and_exposes_savings():
    cat1, cat2 = uuid4(), uuid4()
    result = generate_budget(
        "2026-08", Decimal("800000"), Decimal("500000"),
        Decimal("300000"), None,
        [
            {
                "category_id": cat1,
                "name": "Alimentation",
                "essential": True,
                "current_amount": 150000.0,
                "baseline_amount": 145000.0,
                "expected_amount": 148000.0,
                "variation_percentage": 3.45,
            },
            {
                "category_id": cat2,
                "name": "Restaurants",
                "essential": False,
                "current_amount": 87000.0,
                "baseline_amount": 55000.0,
                "expected_amount": 58000.0,
                "variation_percentage": 58.18,
            },
        ],
    )
    assert result.categories[0].recommended == Decimal("150000.00")
    assert result.categories[0].reduction == Decimal("0.00")
    assert result.categories[1].recommended < Decimal("87000.00")
    assert result.potential_savings > 0


def test_budget_early_in_month_uses_the_habitual_level_not_what_is_already_spent():
    cat = uuid4()
    result = generate_budget(
        "2026-11", Decimal("400000"), Decimal("5000"), Decimal("395000"), None,
        [
            {
                "category_id": cat,
                "name": "Restaurants",
                "essential": False,
                "current_amount": 5000.0,
                "baseline_amount": 60000.0,
                "expected_amount": 60000.0,
                "variation_percentage": -91.7,
            },
        ],
    )
    # 60 000 - 5 % ; avant, le budget était plafonné aux 5 000 déjà dépensés
    assert result.categories[0].recommended == Decimal("57000.00")
    assert result.recommended_expenses == Decimal("57000.00")


def test_budget_without_history_falls_back_to_current_month():
    result = generate_budget(
        "2026-11", Decimal("100000"), Decimal("20000"), Decimal("80000"), None,
        [
            {
                "category_id": uuid4(),
                "name": "Loisirs",
                "essential": False,
                "current_amount": 20000.0,
                "baseline_amount": 0.0,
                "expected_amount": 0.0,
                "variation_percentage": 0.0,
            },
        ],
    )
    assert result.categories[0].recommended == Decimal("19000.00")

