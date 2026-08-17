from decimal import Decimal
from uuid import uuid4

from app.services.budget import generate_budget


def test_budget_does_not_reduce_essentials_and_exposes_savings():
    cat1, cat2 = uuid4(), uuid4()
    result = generate_budget(
        "2026-08", Decimal("800000"), Decimal("500000"), Decimal("300000"), None,
        [
            {"category_id": cat1, "category_name": "Alimentation", "current": Decimal("150000"), "baseline": Decimal("145000"), "essential": True, "deviation": Decimal("0.03"), "optimization_potential": "LOW"},
            {"category_id": cat2, "category_name": "Restaurants", "current": Decimal("87000"), "baseline": Decimal("55000"), "essential": False, "deviation": Decimal("0.58"), "optimization_potential": "HIGH"},
        ],
    )
    assert result.categories[0].recommended == Decimal("150000.00")
    assert result.categories[0].reduction == Decimal("0.00")
    assert result.categories[1].recommended <= Decimal("55000.00")
    assert result.potential_savings > 0
