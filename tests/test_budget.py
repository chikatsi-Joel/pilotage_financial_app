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
