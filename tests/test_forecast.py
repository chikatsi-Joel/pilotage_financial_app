"""Prévision calendaire : catégories ponctuelles, évaluation sans fuite, couverture réelle de la
fourchette, projection du mois en cours au rythme habituel, tendance et fiabilité."""

from __future__ import annotations

import importlib

import numpy as np
import pytest

from app.services.analytics import FinancialAnalyticsEngine
from app.services.analytics.engine import MIN_TREND_MONTHS
from app.services.analytics.models import Category, CategoryType, OptimizationPotential
from app.services.analytics.statistics import forecast_confidence

fc = importlib.import_module("app.services.analytics.forecast")


def _cat() -> Category:
    return Category("c", "Cat", "", CategoryType.NON_ESSENTIAL, OptimizationPotential.MEDIUM)


# ── Catégories ponctuelles ──────────────────────────────────────────────────


def test_quarterly_expense_is_expected_at_a_third_per_month():
    """30 000 un mois sur trois : espérance mensuelle ≈ 10 000, pas 30 000."""
    r = fc.forecast_calendar([30000.0, 0.0, 0.0] * 8)
    assert r.usage_rate == pytest.approx(4 / 12)  # 12 derniers mois
    assert r.value == pytest.approx(10000.0, rel=0.05)


def test_monthly_expense_keeps_its_level():
    r = fc.forecast_calendar([50000.0] * 12)
    assert r.usage_rate == 1.0
    assert r.value == pytest.approx(50000.0)
    assert r.mae == pytest.approx(0.0) and r.low == r.high == pytest.approx(50000.0)


def test_empty_or_unused_series_predicts_zero():
    assert fc.forecast_calendar([]).value == 0.0
    assert fc.forecast_calendar([0.0, 0.0, 0.0]).value == 0.0


def test_short_series_has_no_error_nor_interval():
    r = fc.forecast_calendar([100.0, 120.0, 110.0])
    assert r.mae is None and r.low is None and r.high is None
    assert r.value > 0


# ── Évaluation honnête (aucune information future) ──────────────────────────


def test_backtest_uses_no_future_information():
    """Les erreurs d'une série tronquée sont exactement le début de celles de la série complète."""
    rng = np.random.default_rng(7)
    series = [float(x) for x in rng.gamma(4.0, 25000.0, size=30) * (rng.random(30) > 0.3)]
    _, full = fc.backtest(series)
    for k in (8, 15, 22):
        _, prefix = fc.backtest(series[:k])
        assert prefix == full[: len(prefix)]


def test_reported_error_is_out_of_sample_not_the_best_in_hindsight():
    """La MAE publiée est celle de la procédure de choix, jamais meilleure que la meilleure
    méthode choisie a posteriori sur les mêmes origines."""
    rng = np.random.default_rng(3)
    series = list(100000 + rng.normal(0, 15000, size=30))
    errors, honest = fc.backtest(series)
    best_in_hindsight = min(np.mean(np.abs(e)) for e in errors.values() if len(e) == len(honest))
    assert np.mean(np.abs(honest)) >= best_in_hindsight - 1e-9


# ── Couverture réelle de la fourchette à 80 % ───────────────────────────────


def _simulate(kind: str, months: int, rng) -> list[float]:
    """Série calendaire simulée (+1 mois à prévoir) : niveau, bruit et usage aléatoires."""
    level = rng.uniform(5000, 50000)
    noise = rng.uniform(0.05, 0.4)
    usage = rng.uniform(0.5, 1.0)
    out = []
    for t in range(months + 1):
        lv = level
        if kind == "drift":  # hausse continue de 3 % par mois
            lv = level * 1.03**t
        elif kind == "jump":  # saut de +50 % sur les 4 derniers mois
            lv = level * (1.5 if t >= months + 1 - 4 else 1.0)
        elif kind == "season":  # saisonnalité de ±50 %
            lv = level * (1 + 0.5 * np.sin(2 * np.pi * t / 12))
        out.append(float(max(0.0, rng.normal(lv, noise * lv))) if rng.random() < usage else 0.0)
    return out


def _coverage(kind: str, months: int, seed: int, runs: int = 300) -> float:
    rng = np.random.default_rng(seed)
    hits = total = 0
    for _ in range(runs):
        full = _simulate(kind, months, rng)
        r = fc.forecast_calendar(full[:-1])
        if r.low is None:
            continue
        total += 1
        hits += r.low <= full[-1] <= r.high
    assert total >= runs * 0.9
    return hits / total


@pytest.mark.parametrize("history", [12, 24, 36])
def test_interval_covers_80_percent_when_spending_is_stable(history):
    """Régime stable : couverture ≥ ~80 % dès 12 mois (bornes conformes)."""
    coverage = _coverage("stable", history, seed=42 + history)
    assert 0.77 <= coverage <= 0.97, coverage


@pytest.mark.parametrize("kind", ["drift", "jump"])
@pytest.mark.parametrize("history", [12, 24, 36])
def test_interval_stays_usable_when_spending_changes(kind, history):
    """Hausse continue ou saut de niveau : les erreurs ne sont plus échangeables. La fenêtre
    récente (12 erreurs) maintient une couverture ≥ 0,70 (≈ 0,72-0,80 mesuré), au lieu de
    0,52-0,69 avec tout l'historique. D'où le libellé sans probabilité chiffrée côté écran."""
    coverage = _coverage(kind, history, seed=7 + history)
    assert coverage >= 0.70, coverage


# ── Taux d'utilisation sans biais ────────────────────────────────────────────


@pytest.mark.parametrize("p", [1 / 3, 0.5, 0.8])
@pytest.mark.parametrize("months", [6, 12, 24])
def test_usage_rate_is_unbiased_despite_the_anchor_month(p, months):
    """La série commence toujours par un mois utilisé ; le taux (k−1)/(n−1) n'est pas biaisé :
    l'espérance prévue reste à ±5 % de la vraie (k/n la surestimait de 17 à 33 % sur 6-12 mois)."""
    rng = np.random.default_rng(1)
    values = [
        fc.forecast_calendar([30000.0] + [30000.0 if rng.random() < p else 0.0 for _ in range(months - 1)]).value
        for _ in range(2000)
    ]
    assert float(np.mean(values)) == pytest.approx(30000.0 * p, rel=0.05)


def test_usage_rate_follows_a_cancelled_subscription():
    """Abonnement résilié il y a 12 mois : il n'est plus prévu (taux sur les 12 derniers mois)."""
    assert fc.usage_rate([9000.0] * 12 + [0.0] * 12) == 0.0
    assert fc.forecast_calendar([9000.0] * 12 + [0.0] * 12).value == 0.0


def test_no_interval_below_twelve_months():
    """Moins de 9 erreurs honnêtes : une borne conforme à 80 % n'existe pas, rien n'est publié."""
    r = fc.forecast_calendar([100.0, 120.0, 90.0, 110.0, 105.0, 95.0, 115.0, 100.0, 108.0, 97.0, 103.0])
    assert r.mae is not None and r.low is None and r.high is None
    assert fc.conformal_bounds([1.0] * 8) is None
    assert fc.conformal_bounds([float(i) for i in range(9)]) == (0.0, 8.0)


# ── Projection du mois en cours au rythme habituel ──────────────────────────


def _analyze(monthly, to_date, period=(2026, 11), day=10):
    return FinancialAnalyticsEngine().analyze_category_monthly(
        _cat(), monthly, *period, monthly_to_date=to_date, as_of_day=day
    )


def test_rent_paid_on_the_first_is_not_expected_twice():
    """Loyer réglé le 1er : au 10, tout est déjà payé, la projection reste 50 000."""
    months = [(2026, m) for m in range(5, 11)]
    monthly = {k: 50000.0 for k in months} | {(2026, 11): 50000.0}
    to_date = {k: 50000.0 for k in months} | {(2026, 11): 50000.0}
    r = _analyze(monthly, to_date)
    assert r.profile.forecast.projection == pytest.approx(50000.0)


def test_spread_spending_is_projected_to_the_full_month():
    """Dépense étalée (1/3 du mois au 10) : 10 000 déjà dépensés → ≈ 30 000 sur le mois."""
    months = [(2026, m) for m in range(5, 11)]
    monthly = {k: 30000.0 for k in months} | {(2026, 11): 10000.0}
    to_date = {k: 10000.0 for k in months} | {(2026, 11): 10000.0}
    r = _analyze(monthly, to_date)
    assert r.profile.forecast.projection == pytest.approx(10000.0 + (2 / 3) * 30000.0)


def test_overspending_stays_in_the_projection():
    months = [(2026, m) for m in range(5, 11)]
    monthly = {k: 30000.0 for k in months} | {(2026, 11): 80000.0}
    to_date = {k: 10000.0 for k in months} | {(2026, 11): 80000.0}
    r = _analyze(monthly, to_date)
    assert r.profile.forecast.projection >= 80000.0


def test_closed_month_has_no_projection_and_forecasts_the_next_month():
    monthly = {(2026, m): 30000.0 for m in range(5, 12)}
    r = FinancialAnalyticsEngine().analyze_category_monthly(_cat(), monthly, 2026, 11)
    assert r.profile.forecast.projection is None
    assert r.profile.forecast.value == pytest.approx(30000.0)


# ── Tendance et fiabilité ───────────────────────────────────────────────────


def test_trend_needs_six_months():
    rising = {(2026, m): 1000.0 * m for m in range(6, 11)}  # 5 mois
    r = FinancialAnalyticsEngine().analyze_category_monthly(_cat(), rising, 2026, 10)
    assert len(rising) < MIN_TREND_MONTHS and r.profile.trend == 0.0
    rising[(2026, 5)] = 5000.0  # 6 mois
    r = FinancialAnalyticsEngine().analyze_category_monthly(_cat(), rising, 2026, 10)
    assert r.profile.trend > 0


def test_confidence_reflects_real_forecast_error():
    calendar = [100.0] * 12
    assert forecast_confidence(12, 0.0, calendar) == 1.0
    assert forecast_confidence(12, 50.0, calendar) == pytest.approx(1 / 1.5)
    assert forecast_confidence(6, 0.0, calendar) == pytest.approx(0.5)
    assert forecast_confidence(12, 10.0, [0.0] * 12) == 0.0


def test_few_purchases_do_not_mean_nothing_left_this_month():
    """3 mois d'utilisation, tous les achats avant le 10 : le rythme observé est mélangé au
    rythme du calendrier (1/4), il reste donc une part attendue au lieu de 0."""
    months = [(2026, 7), (2026, 9), (2026, 10)]
    monthly = {k: 9000.0 for k in months}
    to_date = {k: 9000.0 for k in months}
    r = _analyze(monthly, to_date)  # 10 novembre, rien dépensé ce mois-ci
    linear = 10 / 30
    remaining = 1 - (0.75 * 1.0 + 0.25 * linear)
    assert r.profile.forecast.projection == pytest.approx(remaining * r.profile.forecast.value)
    assert r.profile.forecast.projection > 0


def test_usage_rate_is_prudent_on_tiny_histories():
    """Utilisée puis un mois vide : pas de prévision à 0 sur si peu de données (k/n)."""
    assert fc.usage_rate([5000.0, 0.0]) == 0.5
    assert fc.usage_rate([5000.0, 5000.0]) == 1.0
    assert fc.usage_rate([5000.0, 0.0, 0.0, 5000.0]) == pytest.approx(1 / 3)  # (k−1)/(n−1)


def test_seasonal_method_waits_for_enough_errors():
    """Avec 2 erreurs seulement, la saisonnière ne restreint pas la comparaison des autres."""
    errors = {
        "naive": [1.0] * 10,
        "ewma": [5.0] * 8 + [0.1, 0.1],  # meilleure sur les 2 dernières, pire sur l'ensemble
        "trend": [2.0] * 10,
        "seasonal_naive": [9.0, 9.0],
    }
    assert fc._best(errors) == "naive"
    errors["seasonal_naive"] = [0.5] * 6
    assert fc._best(errors) == "seasonal_naive"
