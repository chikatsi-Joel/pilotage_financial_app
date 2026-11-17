"""Optimisations des requêtes : budget de requêtes par endpoint, analytics inchangés, upserts,
connexion libérée avant les appels au LLM et notifications sans INSERT voué à l'échec."""

from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import date
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock

import httpx
import pytest
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models import (
    AIAnalysis,
    Category,
    CategoryAnalytics,
    Essentiality,
    Expense,
    Income,
    MonthlySnapshot,
    NotificationLog,
    OptimizationPotential,
    SavingsContribution,
    SavingsGoal,
    User,
)
from app.schemas.common import DeviceRegister, ExpenseCreate
from app.services import (
    ai_analysis_service,
    analytics_service,
    auth_service,
    expense_service,
    notification_service,
    push_service,
    receipt_service,
)
from app.services.analytics import FinancialAnalyticsEngine, money
from tests.analytics_dataset import PERIOD as GOLDEN_PERIOD
from tests.analytics_dataset import seed as seed_golden

GOLDEN = Path(__file__).parent / "data" / "analytics_golden.json"


# ── Infrastructure : base SQLite partagée + compteur de requêtes ────────────


class QueryCounter:
    def __init__(self) -> None:
        self.statements: list[str] = []

    def __call__(self, conn, cursor, statement, parameters, context, executemany) -> None:
        self.statements.append(statement)

    def reset(self) -> None:
        self.statements.clear()

    @property
    def count(self) -> int:
        return len(self.statements)


@pytest.fixture
async def env():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    counter = QueryCounter()
    event.listen(engine.sync_engine, "before_cursor_execute", counter)
    yield engine, maker, counter
    event.remove(engine.sync_engine, "before_cursor_execute", counter)
    await engine.dispose()


@pytest.fixture
def client(env, monkeypatch):
    _, maker, _ = env

    async def override_db():
        async with maker() as db:
            yield db

    # Les notifications partent en tâche de fond avec leur propre session : hors périmètre ici.
    monkeypatch.setattr(notification_service, "schedule_budget_alerts", lambda *a, **k: None)
    app.dependency_overrides[get_db] = override_db
    yield httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t")
    app.dependency_overrides.clear()


async def _seed_user(
    db: AsyncSession, n_categories: int, months: int = 12
) -> tuple[User, list[Category], str]:
    user = User(name="Q", currency="XAF", email=f"q{n_categories}@x.io", password_hash="x")
    db.add(user)
    await db.flush()
    cats = [
        Category(
            user_id=user.id,
            name=f"C{i:02d}",
            essentiality=Essentiality.ESSENTIAL if i % 2 else Essentiality.NON_ESSENTIAL,
            optimization_potential=OptimizationPotential.HIGH,
        )
        for i in range(n_categories)
    ]
    db.add_all(cats)
    await db.flush()
    db.add(Income(user_id=user.id, amount=Decimal("500000"), income_date=date(2026, 1, 1),
                  source="J", recurring=True))
    for m in range(1, months + 1):
        for i, c in enumerate(cats):
            db.add(Expense(user_id=user.id, category_id=c.id, amount=Decimal(1000 + 37 * i + m),
                           expense_date=date(2026, m, 5)))
    goal = SavingsGoal(user_id=user.id, name="G", target_amount=Decimal("100000"),
                       deadline=date(2027, 6, 1))
    db.add(goal)
    await db.flush()
    db.add(SavingsContribution(savings_goal_id=goal.id, amount=Decimal("1000")))
    await db.commit()
    token = await auth_service._open_session(user, None, db)
    return user, cats, token


# ── Budget de requêtes par endpoint ─────────────────────────────────────────


@pytest.mark.parametrize("n_categories", [2, 12])
async def test_post_expense_query_budget_does_not_grow_with_categories(
    env, client, n_categories
) -> None:
    _, maker, counter = env
    async with maker() as db:
        user, cats, token = await _seed_user(db, n_categories)
    headers = {"Authorization": f"Bearer {token}"}
    async with client as c:
        url = f"/api/v1/users/{user.id}/expenses"
        body = {"category_id": str(cats[0].id), "amount": "1500.005",
                "expense_date": "2026-11-10", "note": "x"}
        await c.post(url, json=body, headers=headers)  # premier calcul du mois
        counter.reset()
        r = await c.post(url, json=body, headers=headers)
    assert r.status_code == 201
    # Montant renvoyé = montant stocké (arrondi au centime), sans relire la ligne
    assert r.json()["amount"] == 1500.01
    assert counter.count <= 10, counter.statements


async def test_cached_dashboard_query_budget(env, client) -> None:
    _, maker, counter = env
    async with maker() as db:
        user, _, token = await _seed_user(db, 8)
    headers = {"Authorization": f"Bearer {token}"}
    async with client as c:
        url = f"/api/v1/users/{user.id}/analytics/dashboard?period=2026-11"
        miss = await c.get(url, headers=headers)
        counter.reset()
        hit = await c.get(url, headers=headers)
    assert hit.status_code == 200
    assert hit.json() == miss.json()
    assert counter.count <= 8, counter.statements


async def test_monthly_totals_match_dashboards_in_one_query(env, client) -> None:
    """Écran Stats « 1A » : un appel (une requête SQL de totaux) au lieu de 12 dashboards."""
    _, maker, counter = env
    async with maker() as db:
        user, _, token = await _seed_user(db, 3)
    headers = {"Authorization": f"Bearer {token}"}
    base = f"/api/v1/users/{user.id}/analytics"
    async with client as c:
        counter.reset()
        monthly = (await c.get(f"{base}/monthly?period=2026-11&months=12", headers=headers)).json()
        monthly_queries = [q for q in counter.statements if "income" in q.lower()]
        dashboards = [
            (await c.get(f"{base}/dashboard?period={m['period']}", headers=headers)).json()
            for m in monthly
        ]
    assert len(monthly) == 12 and len(monthly_queries) == 1
    for m, d in zip(monthly, dashboards, strict=True):
        assert (m["income"], m["total"], m["savings"]) == (
            d["income"], d["expenses"], d["savings"]
        ), m["period"]


async def test_budget_from_cache_matches_live_computation(env) -> None:
    """Le budget lit le cache d'analytics : mêmes lignes qu'avec un calcul complet."""
    from app.services import budget_service
    from app.services.budget import generate_budget

    _, maker, _ = env
    async with maker() as db:
        user, _, _ = await _seed_user(db, 6)
        budget = await budget_service.recommend_budget(user.id, "2026-11", db)
        live = await analytics_service.compute_category_analytics(user.id, "2026-11", db)
        income, expenses = await analytics_service.get_period_totals(user.id, "2026-11", db)
        expected = generate_budget(
            "2026-11", income, expenses, income - expenses,
            None if budget.target_savings is None else Decimal(str(budget.target_savings)),
            [a.model_dump() | {"category_id": a.category_id} for a in live],
        )
    got = [(c.category_id, c.recommended, c.reduction) for c in budget.categories]
    want = [(c.category_id, c.recommended, c.reduction) for c in expected.categories]
    assert got == want
    assert budget.recommended_expenses == expected.recommended_expenses


async def test_category_analytics_without_expenses_is_not_recomputed_each_call(
    env, client
) -> None:
    _, maker, counter = env
    async with maker() as db:
        user, _, token = await _seed_user(db, 0)
    headers = {"Authorization": f"Bearer {token}"}
    async with client as c:
        url = f"/api/v1/users/{user.id}/analytics/categories?period=2026-11"
        assert (await c.get(url, headers=headers)).json() == []
        counter.reset()
        assert (await c.get(url, headers=headers)).json() == []
    assert not any(s.lstrip().upper().startswith("INSERT") for s in counter.statements)
    assert counter.count <= 3, counter.statements


# ── Analytics : mêmes valeurs qu'avant le refactor ──────────────────────────

# Champs calculés sur des résidus STL. Avant le plancher de dispersion (robust_z sur un MAD
# proche de 1e-12) ils n'étaient que du bruit d'arrondi ; ils sont désormais stables et
# comparés avec une tolérance de 1e-6.
_FLOAT_NOISE_FIELDS = {
    "opportunity_score",
    "profile.anomaly_score",
    "profile.seasonality_strength",
}
_AMOUNTS = ("current_amount", "baseline_amount", "expected_amount", "potential_saving")


def _flat(d: dict, prefix: str = "") -> dict:
    out = {}
    for key, value in d.items():
        if isinstance(value, dict):
            out.update(_flat(value, f"{prefix}{key}."))
        else:
            out[f"{prefix}{key}"] = value
    return out


async def test_analytics_match_pre_refactor_output(env) -> None:
    _, maker, _ = env
    golden = json.loads(GOLDEN.read_text(encoding="utf-8"))
    async with maker() as db:
        user = await seed_golden(db)
        for period, expected_rows in golden.items():
            result = await analytics_service.compute_category_analytics(user.id, period, db)
            actual = {r.name: _flat(r.model_dump(mode="json")) for r in result}
            expected = {r["name"]: _flat(r) for r in expected_rows}
            assert actual.keys() == expected.keys(), period
            for name, fields in expected.items():
                got = actual[name]
                # Montants tels qu'ils sont persistés et affichés : égalité stricte au centime
                for amount in _AMOUNTS:
                    assert money(got[amount]) == money(fields[amount]), (period, name, amount)
                for key, value in fields.items():
                    if isinstance(value, float):
                        # Champs issus de résidus STL : stables depuis le plancher de
                        # dispersion, comparés avec une tolérance d'arrondi flottant.
                        tol = 1e-6 if key in _FLOAT_NOISE_FIELDS else 1e-9
                        assert math.isclose(got[key], value, rel_tol=tol, abs_tol=tol), (
                            period, name, key,
                        )
                    else:
                        assert got[key] == value, (period, name, key)


async def test_sql_aggregation_matches_python_grouping_exactly(env) -> None:
    """Totaux mensuels SQL == regroupement Python en Decimal : résultat identique."""
    _, maker, _ = env
    async with maker() as db:
        user = await seed_golden(db)
        categories = (
            await db.execute(
                select(Category)
                .where(Category.user_id == user.id, Category.active.is_(True))
                .order_by(Category.name)
            )
        ).scalars().all()
        expenses = (
            await db.execute(select(Expense).where(Expense.user_id == user.id))
        ).scalars().all()
        for period, (year, month) in ((GOLDEN_PERIOD, (2026, 6)), ("2025-12", (2025, 12))):
            exact = defaultdict(lambda: defaultdict(Decimal))
            for e in expenses:
                ym = (e.expense_date.year, e.expense_date.month)
                if ym <= (year, month):
                    exact[str(e.category_id)][ym] += e.amount
            reference = FinancialAnalyticsEngine().analyze_monthly(
                [analytics_service._to_domain_category(c) for c in categories],
                {cid: {ym: float(v) for ym, v in m.items()} for cid, m in exact.items()},
                year,
                month,
            )
            actual = await analytics_service.compute_category_analytics(user.id, period, db)
            assert [r.name for r in actual] == [r.name for r in reference]
            for got, ref in zip(actual, reference, strict=True):
                assert got.current_amount == ref.current_amount
                assert got.opportunity_score == ref.opportunity_score
                assert got.profile.anomaly_score == ref.profile.anomaly_score
                assert got.profile.level == ref.profile.level
                assert got.profile.history_months == ref.profile.history_months


async def test_history_window_bounds_the_aggregated_months(env, monkeypatch) -> None:
    _, maker, _ = env
    monkeypatch.setattr(settings, "analytics_history_months", 3)
    async with maker() as db:
        user, _, _ = await _seed_user(db, 1, months=6)
        (row,) = await analytics_service.compute_category_analytics(user.id, "2026-06", db)
    assert row.profile.history_months == 3


# ── Upsert du cache d'analytics ─────────────────────────────────────────────


async def test_two_expenses_in_the_same_month_upsert_without_integrity_error(env) -> None:
    _, maker, _ = env
    async with maker() as db:
        user, cats, _ = await _seed_user(db, 3, months=10)  # novembre encore vide
        for amount in ("120.50", "79.50"):
            payload = ExpenseCreate(
                amount=Decimal(amount), category_id=cats[0].id, expense_date=date(2026, 11, 3)
            )
            await expense_service.create(user.id, payload, db)
        await analytics_service.refresh_analytics(user.id, "2026-11", db)  # conflit : mise à jour

        snapshots = (
            await db.execute(select(MonthlySnapshot).where(MonthlySnapshot.period == "2026-11"))
        ).scalars().all()
        assert len(snapshots) == 1
        assert snapshots[0].expenses == Decimal("200.00")
        rows = (
            await db.execute(
                select(CategoryAnalytics).where(CategoryAnalytics.period == "2026-11")
            )
        ).scalars().all()
        assert len(rows) == 3
        cached = await analytics_service.get_category_analytics_snapshot(user.id, "2026-11", db)
        by_category = {a.category_id: a for a in cached}
        assert by_category[cats[0].id].current_amount == 200.0


async def test_refresh_updates_rows_already_loaded_in_the_session(env) -> None:
    """L'upsert passe par SQL : la relecture ne doit pas renvoyer l'objet périmé de la session."""
    _, maker, _ = env
    async with maker() as db:
        user, cats, _ = await _seed_user(db, 1, months=10)  # novembre encore vide
        before = await analytics_service.get_category_analytics_snapshot(user.id, "2026-11", db)
        db.add(Expense(user_id=user.id, category_id=cats[0].id, amount=Decimal("5000"),
                       expense_date=date(2026, 11, 9)))
        await db.flush()
        await analytics_service.refresh_analytics(user.id, "2026-11", db)
        after = await analytics_service.get_category_analytics_snapshot(user.id, "2026-11", db)
    assert before[0].current_amount == 0.0
    assert after[0].current_amount == 5000.0


async def test_writes_invalidate_without_recomputing(env, monkeypatch) -> None:
    """Écriture = invalidation seule ; le recalcul a lieu une fois, à la lecture suivante."""
    _, maker, _ = env
    calls: list[str] = []
    original = analytics_service.refresh_analytics

    async def spy(user_id, period, db, today=None):
        calls.append(period)
        return await original(user_id, period, db, today)

    monkeypatch.setattr(analytics_service, "refresh_analytics", spy)
    async with maker() as db:
        user, cats, _ = await _seed_user(db, 2)
        payloads = [
            ExpenseCreate(amount=Decimal("10"), category_id=cats[i % 2].id,
                          expense_date=date(2026, 11 - (i % 2), 2 + i))
            for i in range(6)
        ]
        created = await expense_service.create_many(user.id, payloads, db)
        assert calls == []
        assert len(created) == 6 and all(e.amount == Decimal("10.00") for e in created)

        await analytics_service.get_category_analytics_snapshot(user.id, "2026-11", db)
        await analytics_service.get_category_analytics_snapshot(user.id, "2026-11", db)
    assert calls == ["2026-11"]


# ── Connexion libérée avant les appels au LLM ───────────────────────────────


async def test_ai_analysis_ends_the_transaction_before_calling_the_model(env, monkeypatch) -> None:
    _, maker, _ = env
    computed: list[str] = []
    original = analytics_service.compute_category_analytics

    async def spy(user_id, period, db, today=None):
        computed.append(period)
        return await original(user_id, period, db, today)

    monkeypatch.setattr(analytics_service, "compute_category_analytics", spy)
    async with maker() as db:
        user, _, _ = await _seed_user(db, 2)
        provider = AsyncMock()

        async def analyze(context):
            assert not db.in_transaction(), "connexion encore réservée pendant l'appel au modèle"
            return {"summary": "ok", "income": context["dashboard"]["income"]}

        provider.analyze = analyze
        result = await ai_analysis_service.analyze(user.id, "2026-11", db, provider)
    assert result == {"summary": "ok", "income": "500000.0"}
    assert computed == ["2026-11"]  # analytics calculés une seule fois


async def test_receipt_scan_ends_the_transaction_before_calling_the_model(env) -> None:
    _, maker, _ = env
    async with maker() as db:
        user, _, _ = await _seed_user(db, 2)
        provider = AsyncMock()

        async def scan(image_b64, known):
            assert not db.in_transaction(), "connexion encore réservée pendant l'appel au modèle"
            return {"amount": 10, "category": known[0], "items": []}

        provider.scan_receipt = scan
        result = await receipt_service.scan_receipt(user.id, b"img", "image/png", db, provider)
    assert result["category"] == "C00"


# ── Notifications : clés déjà envoyées lues d'avance ────────────────────────


async def test_second_budget_alert_pass_reads_sent_keys_without_failing_insert(
    env, monkeypatch
) -> None:
    _, maker, counter = env

    async def fake_post(messages):
        return [{"status": "ok"} for _ in messages]

    monkeypatch.setattr(push_service, "_post_expo", fake_post)
    async with maker() as db:
        user = User(name="N", currency="XAF")
        db.add(user)
        await db.flush()
        uid = user.id
        device = DeviceRegister(token="ExponentPushToken[q]", platform="android")
        await push_service.register_device(uid, device, db)
        cat = Category(
            user_id=uid, name="T", essentiality=Essentiality.ESSENTIAL,
            optimization_potential=OptimizationPotential.LOW, monthly_budget=Decimal("100"),
        )
        db.add(cat)
        await db.flush()
        cid = cat.id
        db.add(Expense(user_id=uid, category_id=cid, amount=Decimal("120"),
                       expense_date=date(2026, 11, 2)))
        await db.commit()

        await notification_service.check_budget_alerts(uid, {(cid, "2026-11")}, db)
        sent = (await db.execute(select(func.count()).select_from(NotificationLog))).scalar_one()
        counter.reset()
        await notification_service.check_budget_alerts(uid, {(cid, "2026-11")}, db)
    assert sent == 2  # paliers 80 et 100
    assert not any(s.lstrip().upper().startswith("INSERT") for s in counter.statements)
    assert counter.count <= 4, counter.statements


# ── Analyse IA mise en cache ────────────────────────────────────────────────


class _FakeProvider:
    def __init__(self, fallback: bool = False) -> None:
        self.calls = 0
        self.fallback = fallback

    async def model(self) -> str:
        return "m1"

    async def analyze(self, context):
        self.calls += 1
        return {"summary": f"analyse {self.calls}", "alerts": [], "recommendations": [],
                "projected_impact": {}, "fallback": self.fallback}


async def test_ai_analysis_is_reused_until_data_changes(env) -> None:
    _, maker, _ = env
    provider = _FakeProvider()
    async with maker() as db:
        user, cats, _ = await _seed_user(db, 2)
        first = await ai_analysis_service.analyze(user.id, "2026-11", db, provider)
        again = await ai_analysis_service.analyze(user.id, "2026-11", db, provider)
        assert provider.calls == 1
        assert again["cached"] is True and again["summary"] == first["summary"]

        # Nouvelle dépense : contexte différent, le modèle est rappelé.
        await expense_service.create(
            user.id,
            ExpenseCreate(amount=Decimal("999"), category_id=cats[0].id,
                          expense_date=date(2026, 11, 3)),
            db,
        )
        changed = await ai_analysis_service.analyze(user.id, "2026-11", db, provider)
        assert provider.calls == 2 and changed["summary"] == "analyse 2"

        # Relance explicite, une fois le délai entre deux relances écoulé.
        from datetime import UTC, datetime, timedelta

        later = datetime.now(UTC) + ai_analysis_service.FORCE_COOLDOWN + timedelta(minutes=1)
        await ai_analysis_service.analyze(user.id, "2026-11", db, provider, force=True, now=later)
        assert provider.calls == 3
        rows = (await db.execute(select(func.count()).select_from(AIAnalysis))).scalar_one()
    assert rows == 1


async def test_ai_fallback_is_not_stored(env) -> None:
    _, maker, _ = env
    provider = _FakeProvider(fallback=True)
    async with maker() as db:
        user, _, _ = await _seed_user(db, 2)
        await ai_analysis_service.analyze(user.id, "2026-11", db, provider)
        await ai_analysis_service.analyze(user.id, "2026-11", db, provider)
        rows = (await db.execute(select(func.count()).select_from(AIAnalysis))).scalar_one()
    assert provider.calls == 2 and rows == 0


async def test_ai_unparsable_answer_is_not_stored(env) -> None:
    _, maker, _ = env

    class Unparsable(_FakeProvider):
        async def analyze(self, context):
            self.calls += 1
            return {"summary": "texte brut", "alerts": [], "recommendations": [],
                    "projected_impact": {}, "parse_error": "JSON invalide"}

    provider = Unparsable()
    async with maker() as db:
        user, _, _ = await _seed_user(db, 2)
        await ai_analysis_service.analyze(user.id, "2026-11", db, provider)
        await ai_analysis_service.analyze(user.id, "2026-11", db, provider)
        rows = (await db.execute(select(func.count()).select_from(AIAnalysis))).scalar_one()
    assert provider.calls == 2 and rows == 0


async def test_ai_reused_analysis_keeps_number_warnings(env) -> None:
    from app.services.ai import validate_llm_output

    _, maker, _ = env

    class Inventive(_FakeProvider):
        async def analyze(self, context):
            self.calls += 1
            result = {"summary": "Vous pourriez économiser 987654 XAF.", "alerts": [],
                      "recommendations": [], "projected_impact": {}}
            return validate_llm_output(result, context)

    provider = Inventive()
    async with maker() as db:
        user, _, _ = await _seed_user(db, 2)
        first = await ai_analysis_service.analyze(user.id, "2026-11", db, provider)
        again = await ai_analysis_service.analyze(user.id, "2026-11", db, provider)
    assert provider.calls == 1 and first.get("number_warnings")
    assert again["cached"] is True and again.get("number_warnings") == first["number_warnings"]


async def test_cached_analytics_expose_history_and_last_change(env) -> None:
    """Le cache renvoie le même profil que le calcul complet, history_months et last_change compris."""
    _, maker, _ = env
    async with maker() as db:
        user, _, _ = await _seed_user(db, 3)
        live = await analytics_service.compute_category_analytics(user.id, "2026-11", db)
        cached = await analytics_service.get_category_analytics_snapshot(user.id, "2026-11", db)
    by_id = {a.category_id: a.profile for a in live}
    assert cached and all(c.profile.history_months is not None for c in cached)
    for c in cached:
        assert c.profile.history_months == by_id[c.category_id].history_months
        assert c.profile.last_change == by_id[c.category_id].last_change



async def test_forced_ai_refresh_is_rate_limited(env) -> None:
    """Relance forcée : une par mois et par FORCE_COOLDOWN ; ensuite l'analyse est resservie."""
    from datetime import UTC, datetime, timedelta

    _, maker, _ = env
    provider = _FakeProvider()
    async with maker() as db:
        user, _, _ = await _seed_user(db, 2)
        await ai_analysis_service.analyze(user.id, "2026-11", db, provider)
        stored_at = (await db.execute(select(AIAnalysis.created_at))).scalar_one()
        if stored_at.tzinfo is None:
            stored_at = stored_at.replace(tzinfo=UTC)

        soon = stored_at + timedelta(minutes=2)
        blocked = await ai_analysis_service.analyze(user.id, "2026-11", db, provider, force=True, now=soon)
        assert provider.calls == 1
        assert blocked["cached"] is True and 470 <= blocked["retry_after"] <= 480

        later = stored_at + ai_analysis_service.FORCE_COOLDOWN + timedelta(seconds=1)
        fresh = await ai_analysis_service.analyze(user.id, "2026-11", db, provider, force=True, now=later)
    assert provider.calls == 2 and "retry_after" not in fresh


async def test_forced_refresh_after_new_expense_calls_the_model(env) -> None:
    """Données changées : la relance forcée recalcule, même dans le délai de 10 minutes."""
    from datetime import UTC, timedelta

    _, maker, _ = env
    provider = _FakeProvider()
    async with maker() as db:
        user, cats, _ = await _seed_user(db, 2)
        await ai_analysis_service.analyze(user.id, "2026-11", db, provider)
        stored_at = (await db.execute(select(AIAnalysis.created_at))).scalar_one()
        if stored_at.tzinfo is None:
            stored_at = stored_at.replace(tzinfo=UTC)
        await expense_service.create(
            user.id,
            ExpenseCreate(amount=Decimal("777"), category_id=cats[0].id, expense_date=date(2026, 11, 4)),
            db,
        )
        result = await ai_analysis_service.analyze(
            user.id, "2026-11", db, provider, force=True, now=stored_at + timedelta(minutes=2)
        )
    assert provider.calls == 2 and "retry_after" not in result
