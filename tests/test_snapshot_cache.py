from decimal import Decimal
from uuid import uuid4

from app.models import Category, CategoryAnalytics
from app.models.entities import (
    ConfidenceLevel,
    DriftSignal,
    Essentiality,
    OptimizationPotential,
    TrendDirection,
)
from app.services.analytics_service import _snapshot_to_category_read


def _row(profile_data: dict) -> CategoryAnalytics:
    return CategoryAnalytics(
        user_id=uuid4(),
        category_id=uuid4(),
        period="2026-10",
        baseline=Decimal("100"),
        trend=Decimal("0"),
        volatility=Decimal("0"),
        deviation=Decimal("10"),
        frequency=0,
        confidence=ConfidenceLevel.HIGH,
        trend_direction=TrendDirection.STABLE,
        drift_signal=DriftSignal.NORMAL,
        current_amount=Decimal("110"),
        estimated_saving=Decimal("5"),
        profile_data=profile_data,
    )


def _category(essentiality: Essentiality) -> Category:
    return Category(
        name="Loisirs",
        essentiality=essentiality,
        optimization_potential=OptimizationPotential.HIGH,
    )


def test_cached_read_uses_persisted_essential_and_score() -> None:
    read = _snapshot_to_category_read(
        _row({"essential": False, "opportunity_score": 0.7}),
        _category(Essentiality.ESSENTIAL),
    )
    assert read.essential is False
    assert read.opportunity_score == 0.7
    assert read.name == "Loisirs"


def test_cached_read_falls_back_to_category_for_old_rows() -> None:
    non_essential = _snapshot_to_category_read(
        _row({}), _category(Essentiality.NON_ESSENTIAL)
    )
    essential = _snapshot_to_category_read(
        _row({}), _category(Essentiality.ESSENTIAL)
    )
    assert non_essential.essential is False
    assert essential.essential is True
