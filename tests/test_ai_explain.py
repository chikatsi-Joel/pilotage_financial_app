"""« Comprendre avec l'IA » sur une catégorie : explication propre à la catégorie, resservie
tant que ses données ne changent pas, et une analyse du quota par nouvelle explication."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.models import AIUsage, Expense, User
from app.services import ai_explain_service, ai_quota
from app.services.errors import NotFound
from tests.test_query_optimizations import _seed_user, env  # noqa: F401

NOW = datetime(2026, 11, 17, 12, tzinfo=UTC)
PERIOD = "2026-11"
ANSWER = json.dumps({"summary": "Catégorie stable ce mois-ci.", "points": ["À surveiller", ""]})


class FakeProvider:
    name = "fake"

    def __init__(self, answers: list[str | Exception] | None = None) -> None:
        self.answers = answers or [ANSWER] * 5
        self.prompts: list[str] = []

    async def model(self) -> str:
        return "fake-model"

    async def complete_json(self, system_prompt: str, user_prompt: str, *, max_output_tokens: int):
        self.prompts.append(user_prompt)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer

    def describe_error(self, exc: Exception) -> str:
        return f"panne : {exc}"


def _freemium(monkeypatch, quota: int) -> None:
    async def fake() -> tuple[bool, int]:
        return True, quota

    monkeypatch.setattr(ai_quota, "freemium_settings", fake)


async def _explain(db, user, cat, provider):
    return await ai_explain_service.explain_category(user.id, PERIOD, cat.id, db, provider, now=NOW)


async def test_explains_the_category_and_reuses_it_until_data_changes(env) -> None:  # noqa: F811
    _, maker, _ = env
    async with maker() as db:
        user, cats, _ = await _seed_user(db, 3, months=11)
        await db.commit()
        provider = FakeProvider()

        first = await _explain(db, user, cats[1], provider)
        assert first["summary"] == "Catégorie stable ce mois-ci."
        assert first["points"] == ["À surveiller"]  # points vides retirés
        prompt = provider.prompts[0]
        assert "Catégorie : C01" in prompt and "C02" not in prompt  # contexte de la seule catégorie
        assert "Devise : XAF" in prompt and "Plus grosses dépenses" in prompt

        again = await _explain(db, user, cats[1], provider)
        assert again["cached"] is True and len(provider.prompts) == 1

        db.add(Expense(user_id=user.id, category_id=cats[1].id, amount=Decimal("9000"),
                       expense_date=date(2026, 11, 16), note="Réparation"))
        await db.commit()
        await _explain(db, user, cats[1], provider)
        assert len(provider.prompts) == 2 and "Réparation" in provider.prompts[1]


async def test_each_new_explanation_consumes_one_analysis(env, monkeypatch) -> None:  # noqa: F811
    _, maker, _ = env
    _freemium(monkeypatch, quota=1)
    async with maker() as db:
        user, cats, _ = await _seed_user(db, 2, months=11)
        await db.commit()
        provider = FakeProvider()
        await _explain(db, user, cats[0], provider)
        await _explain(db, user, cats[0], provider)  # resservie : gratuite
        assert (await db.execute(select(func.count()).select_from(AIUsage))).scalar_one() == 1

        exhausted = await _explain(db, user, cats[1], provider)
        assert exhausted["quota_exceeded"] is True and exhausted["summary"] == ""
        assert len(provider.prompts) == 1


async def test_model_failure_gives_figures_without_consuming(env, monkeypatch) -> None:  # noqa: F811
    _, maker, _ = env
    _freemium(monkeypatch, quota=3)
    async with maker() as db:
        user, cats, _ = await _seed_user(db, 2, months=11)
        await db.commit()
        result = await _explain(db, user, cats[0], FakeProvider([RuntimeError("503")]))
        assert result["fallback"] is True and result["error"] == "panne : 503"
        assert "C00" in result["summary"] and "XAF" in result["summary"]
        assert (await db.execute(select(func.count()).select_from(AIUsage))).scalar_one() == 0


async def test_unreadable_answer_is_a_fallback(env) -> None:  # noqa: F811
    _, maker, _ = env
    async with maker() as db:
        user, cats, _ = await _seed_user(db, 1, months=11)
        await db.commit()
        result = await _explain(db, user, cats[0], FakeProvider(["pas du json"]))
        assert result["fallback"] is True


async def test_cannot_explain_another_users_category(env) -> None:  # noqa: F811
    _, maker, _ = env
    async with maker() as db:
        _, cats, _ = await _seed_user(db, 1, months=11)
        intruder = User(name="I", currency="XAF", email="i@x.io", password_hash="x")
        db.add(intruder)
        await db.commit()
        with pytest.raises(NotFound):
            await _explain(db, intruder, cats[0], FakeProvider())
