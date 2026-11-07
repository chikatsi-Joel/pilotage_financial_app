from datetime import date

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.errors import register_error_handlers
from app.services.errors import (
    BusinessRule,
    Conflict,
    InvalidEnum,
    InvalidImage,
    InvalidPeriod,
    NotFound,
)
from app.services.periods import (
    month_bounds,
    parse_period,
    period_of,
    recent_periods,
    shift_period,
)


@pytest.mark.parametrize(
    ("exc", "status"),
    [
        (NotFound, 404),
        (Conflict, 409),
        (BusinessRule, 422),
        (InvalidPeriod, 422),
        (InvalidEnum, 422),
        (InvalidImage, 422),
    ],
)
def test_service_errors_map_to_http_status(exc: type[Exception], status: int) -> None:
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/boom")
    async def boom() -> None:
        raise exc("nope")

    response = TestClient(app).get("/boom")
    assert response.status_code == status
    assert response.json() == {"detail": "nope"}


def test_period_helpers() -> None:
    assert parse_period("2026-02") == (2026, 2)
    assert period_of(date(2026, 3, 9)) == "2026-03"
    assert month_bounds("2024-02") == (date(2024, 2, 1), date(2024, 2, 29))
    assert shift_period("2026-01") == "2025-12"
    assert shift_period("2026-01", 2) == "2026-03"
    assert shift_period("2026-03", -14) == "2025-01"
    assert recent_periods("2026-02", 3) == ["2025-12", "2026-01", "2026-02"]


@pytest.mark.parametrize("bad", ["2026-13", "abc", "2026", "", "2026-00"])
def test_invalid_period_raises(bad: str) -> None:
    with pytest.raises(InvalidPeriod):
        parse_period(bad)
