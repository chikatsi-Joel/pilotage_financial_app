from decimal import Decimal

from app.services.monthly_service import fill_months
from app.services.periods import recent_periods


def test_fill_months_keeps_order_and_zero_fills():
    periods = recent_periods("2026-03", 4)
    assert periods == ["2025-12", "2026-01", "2026-02", "2026-03"]
    out = fill_months(periods, {"2026-01": Decimal("1200.5"), "2026-03": Decimal("80")})
    assert [(m.period, m.total) for m in out] == [
        ("2025-12", 0.0),
        ("2026-01", 1200.5),
        ("2026-02", 0.0),
        ("2026-03", 80.0),
    ]
