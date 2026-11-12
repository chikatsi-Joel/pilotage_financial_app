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

# Champs calculés sur des résidus STL quasi nuls (robust_z avec un MAD proche de 1e-12) : leur
# valeur est du bruit d'arrondi flottant. L'ancien code les faisait déjà varier selon l'ordre,
# non spécifié, des lignes renvoyées par la base. Ils sont comparés exactement dans
# test_sql_aggregation_matches_python_grouping_exactly, pas ici.
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
                    if key in _FLOAT_NOISE_FIELDS:
                        continue
                    if isinstance(value, float):
                        assert math.isclose(got[key], value, rel_tol=1e-9, abs_tol=1e-9), (
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


async def test_bulk_recomputes_each_touched_month_once(env, monkeypatch) -> None:
    _, maker, _ = env
    calls: list[str] = []
    original = analytics_service.refresh_analytics

    async def spy(user_id, period, db):
        calls.append(period)
        return await original(user_id, period, db)

    monkeypatch.setattr(analytics_service, "refresh_analytics", spy)
    async with maker() as db:
        user, cats, _ = await _seed_user(db, 2)
        payloads = [
            ExpenseCreate(amount=Decimal("10"), category_id=cats[i % 2].id,
                          expense_date=date(2026, 11 - (i % 2), 2 + i))
            for i in range(6)
        ]
        created = await expense_service.create_many(user.id, payloads, db)
    assert sorted(calls) == ["2026-10", "2026-11"]
    assert len(created) == 6 and all(e.amount == Decimal("10.00") for e in created)


# ── Connexion libérée avant les appels au LLM ───────────────────────────────


async def test_ai_analysis_ends_the_transaction_before_calling_the_model(env, monkeypatch) -> None:
    _, maker, _ = env
    computed: list[str] = []
    original = analytics_service.compute_category_analytics

    async def spy(user_id, period, db):
        computed.append(period)
        return await original(user_id, period, db)

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
