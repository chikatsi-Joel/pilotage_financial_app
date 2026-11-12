"""Événements de notification : alertes budget, paliers d'épargne, rappel quotidien,
résumé hebdomadaire et conseil de l'IA.

Chaque notification passe par `_claim` : une clé unique (par utilisateur) garantit
qu'elle n'est envoyée qu'une fois, même si la tâche planifiée tourne plusieurs fois.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Awaitable, Callable
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import distinct, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_session_factory
from app.models import (
    Budget,
    Category,
    Expense,
    NotificationLog,
    PushDevice,
    SavingsContribution,
    SavingsGoal,
    User,
)
from app.services import ai_analysis_service, analytics_service, push_service
from app.services.periods import month_bounds, period_of

log = logging.getLogger(__name__)

BUDGET_THRESHOLDS = (80, 100)
SAVINGS_THRESHOLDS = (50, 100)
AI_BODY_MAX = 160
WEEKLY_HOUR = 18  # dimanche, heure locale de l'utilisateur
SUNDAY = 6
MONTH_THRESHOLDS = (80, 100)
# Alerte de rythme : seulement entre 25 % et 85 % du mois, si la part du budget dépensée
# devance la part du mois écoulée d'au moins 20 points.
PACE_WINDOW = (0.25, 0.85)
PACE_GAP = 0.20
SAVINGS_IDLE_DAYS = 30
# Les vérifications planifiées (hors alerte immédiate après une dépense) ne partent qu'en journée.
DAY_HOURS = range(9, 21)


def _money(amount: Decimal | float | int, currency: str) -> str:
    return f"{Decimal(str(amount)):,.0f}".replace(",", " ") + f" {currency}"


def _local_now(now_utc: datetime, tz_name: str) -> datetime:
    try:
        return now_utc.astimezone(ZoneInfo(tz_name))
    except (ZoneInfoNotFoundError, ValueError):
        return now_utc.astimezone(ZoneInfo("UTC"))


async def _claim(db: AsyncSession, user_id: UUID, key: str) -> bool:
    """Réserve la clé ; False si cette notification a déjà été envoyée."""
    db.add(NotificationLog(user_id=user_id, key=key))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return False
    return True


async def _has_devices(db: AsyncSession, user_id: UUID) -> bool:
    count = (
        await db.execute(
            select(func.count()).select_from(PushDevice).where(PushDevice.user_id == user_id)
        )
    ).scalar_one()
    return count > 0


# ── Alertes budget ───────────────────────────────────────────────────────


async def check_budget_alerts(
    user_id: UUID, pairs: set[tuple[UUID, str]], db: AsyncSession
) -> None:
    """Après une dépense : prévient quand une catégorie atteint 80 % puis 100 % de son budget."""
    if not await _has_devices(db, user_id):
        return
    prefs = await push_service.get_preferences(user_id, db)
    if not prefs.budget_alerts:
        return
    user = await db.get(User, user_id)
    currency = user.currency if user else ""

    for category_id, period in pairs:
        category = await db.get(Category, category_id)
        if not category or category.user_id != user_id:
            continue
        budget = category.monthly_budget
        category_name = category.name
        if not budget or budget <= 0:
            continue
        start, end = month_bounds(period)
        spent = (
            await db.execute(
                select(func.coalesce(func.sum(Expense.amount), Decimal("0"))).where(
                    Expense.user_id == user_id,
                    Expense.category_id == category_id,
                    Expense.expense_date.between(start, end),
                )
            )
        ).scalar_one()
        ratio = spent / budget * 100
        crossed = [t for t in BUDGET_THRESHOLDS if ratio >= t]
        if not crossed:
            continue
        # Tous les paliers franchis sont réservés ; seul le plus haut est annoncé.
        claimed = [
            await _claim(db, user_id, f"budget:{category_id}:{period}:{t}") for t in crossed
        ]
        if not claimed[-1]:
            continue
        top = crossed[-1]
        if top >= 100:
            title = f"Budget « {category_name} » dépassé"
        else:
            title = f"Budget « {category_name} » à {top} %"
        body = f"{_money(spent, currency)} dépensés sur {_money(budget, currency)} ce mois-ci."
        await push_service.send_to_user(
            user_id, title, body, db, {"route": "/budget", "kind": "budget"}
        )


# ── Objectifs d'épargne ──────────────────────────────────────────────────


async def check_savings_milestone(user_id: UUID, goal_id: UUID, db: AsyncSession) -> None:
    if not await _has_devices(db, user_id):
        return
    prefs = await push_service.get_preferences(user_id, db)
    if not prefs.savings_milestones:
        return
    goal = await db.get(SavingsGoal, goal_id)
    if not goal or goal.user_id != user_id or not goal.target_amount:
        return
    total = (
        await db.execute(
            select(func.coalesce(func.sum(SavingsContribution.amount), Decimal("0"))).where(
                SavingsContribution.savings_goal_id == goal_id
            )
        )
    ).scalar_one()
    goal_name, target = goal.name, goal.target_amount
    ratio = total / target * 100
    crossed = [t for t in SAVINGS_THRESHOLDS if ratio >= t]
    if not crossed:
        return
    claimed = [await _claim(db, user_id, f"savings:{goal_id}:{t}") for t in crossed]
    if not claimed[-1]:
        return
    top = crossed[-1]
    title = (
        f"Objectif « {goal_name} » atteint !"
        if top >= 100
        else f"Objectif « {goal_name} » : {top} % atteint"
    )
    user = await db.get(User, user_id)
    currency = user.currency if user else ""
    body = f"{_money(total, currency)} épargnés sur {_money(target, currency)}."
    await push_service.send_to_user(
        user_id, title, body, db, {"route": "/savings", "kind": "savings"}
    )


# ── Rappel quotidien ─────────────────────────────────────────────────────


async def send_daily_reminder(user_id: UUID, local_today: date, db: AsyncSession) -> None:
    if not await _claim(db, user_id, f"daily:{local_today.isoformat()}"):
        return
    logged_today = (
        await db.execute(
            select(func.count()).select_from(Expense).where(
                Expense.user_id == user_id, Expense.expense_date == local_today
            )
        )
    ).scalar_one()
    if logged_today:
        return  # déjà à jour : inutile de déranger
    await push_service.send_to_user(
        user_id,
        "Vos dépenses du jour",
        "Pensez à noter vos dépenses d'aujourd'hui pour garder un suivi précis.",
        db,
        {"route": "/add-expense", "kind": "daily"},
    )


# ── Résumé hebdomadaire + conseil IA ─────────────────────────────────────


async def send_weekly_summary(user_id: UUID, local_today: date, db: AsyncSession) -> None:
    iso = local_today.isocalendar()
    if not await _claim(db, user_id, f"weekly:{iso.year}-W{iso.week:02d}"):
        return
    user = await db.get(User, user_id)
    currency = user.currency if user else ""
    since = local_today - timedelta(days=6)

    week_total = (
        await db.execute(
            select(func.coalesce(func.sum(Expense.amount), Decimal("0"))).where(
                Expense.user_id == user_id,
                Expense.expense_date.between(since, local_today),
            )
        )
    ).scalar_one()
    top = (
        await db.execute(
            select(Category.name, func.sum(Expense.amount).label("total"))
            .join(Category, Category.id == Expense.category_id)
            .where(
                Expense.user_id == user_id,
                Expense.expense_date.between(since, local_today),
            )
            .group_by(Category.name)
            .order_by(func.sum(Expense.amount).desc())
            .limit(1)
        )
    ).first()
    income, expenses = await analytics_service.get_period_totals(
        user_id, period_of(local_today), db
    )

    parts = [f"Dépensé cette semaine : {_money(week_total, currency)}."]
    if top:
        parts.append(f"Plus gros poste : {top[0]}.")
    parts.append(f"Solde du mois : {_money(income - expenses, currency)}.")
    await push_service.send_to_user(
        user_id,
        "Votre résumé de la semaine",
        " ".join(parts),
        db,
        {"route": "/dashboard", "kind": "weekly"},
    )


async def send_ai_insight(
    user_id: UUID, local_today: date, db: AsyncSession, provider: Any
) -> None:
    """Une fois par semaine : résumé produit par l'IA (ignoré si c'est un repli local)."""
    iso = local_today.isocalendar()
    if not await _claim(db, user_id, f"ai:{iso.year}-W{iso.week:02d}"):
        return
    result = await ai_analysis_service.analyze(user_id, period_of(local_today), db, provider)
    summary = (result.get("summary") or "").strip()
    if result.get("fallback") or not summary:
        return
    body = summary if len(summary) <= AI_BODY_MAX else summary[: AI_BODY_MAX - 1].rstrip() + "…"
    await push_service.send_to_user(
        user_id, "Le conseil de l'IA", body, db, {"route": "/analyse-insights", "kind": "ai"}
    )


# ── Budget du mois (décision validée) et rythme de dépense ──────────────


async def check_budget_catchup(user_id: UUID, local_today: date, db: AsyncSession) -> None:
    """Rattrapage : alerte aussi les dépassements déjà présents (sans nouvelle dépense)."""
    period = period_of(local_today)
    ids = (
        await db.execute(
            select(Category.id).where(
                Category.user_id == user_id, Category.monthly_budget.is_not(None)
            )
        )
    ).scalars().all()
    if ids:
        await check_budget_alerts(user_id, {(cid, period) for cid in ids}, db)


async def check_month_budget(user_id: UUID, local_today: date, db: AsyncSession) -> None:
    """Budget du mois validé : paliers 80 % / 100 %, et alerte de rythme une fois par mois."""
    period = period_of(local_today)
    budget_row = (
        await db.execute(select(Budget).where(Budget.user_id == user_id, Budget.period == period))
    ).scalar_one_or_none()
    if budget_row is None or not budget_row.accepted_total or budget_row.accepted_total <= 0:
        return
    budget = budget_row.accepted_total
    start, end = month_bounds(period)
    spent = (
        await db.execute(
            select(func.coalesce(func.sum(Expense.amount), Decimal("0"))).where(
                Expense.user_id == user_id, Expense.expense_date.between(start, end)
            )
        )
    ).scalar_one()
    user = await db.get(User, user_id)
    currency = user.currency if user else ""
    share = float(spent / budget)
    time_share = local_today.day / end.day
    days_left = end.day - local_today.day + 1

    crossed = [t for t in MONTH_THRESHOLDS if share * 100 >= t]
    if crossed:
        claimed = [await _claim(db, user_id, f"month:{period}:{t}") for t in crossed]
        if claimed[-1]:
            top = crossed[-1]
            if top >= 100:
                title = "Budget du mois dépassé"
                body = (
                    f"{_money(spent, currency)} dépensés pour un budget de "
                    f"{_money(budget, currency)} (+{_money(spent - budget, currency)})."
                )
            else:
                title = f"Budget du mois à {top} %"
                body = (
                    f"Il reste {_money(budget - spent, currency)} pour {days_left} jour"
                    f"{'s' if days_left > 1 else ''}."
                )
            await push_service.send_to_user(
                user_id, title, body, db, {"route": "/dashboard", "kind": "month_budget"}
            )
            return  # un seul message par passage

    if share < 1 and PACE_WINDOW[0] <= time_share <= PACE_WINDOW[1] and share - time_share >= PACE_GAP:
        if await _claim(db, user_id, f"pace:{period}"):
            per_day = (budget - spent) / days_left
            await push_service.send_to_user(
                user_id,
                "Vous dépensez plus vite que prévu",
                f"{round(share * 100)} % du budget dépensé alors que {round(time_share * 100)} % "
                f"du mois est écoulé. Pour tenir, visez ≈ {_money(per_day, currency)} par jour.",
                db,
                {"route": "/dashboard", "kind": "pace"},
            )


# ── Objectifs d'épargne sans versement ───────────────────────────────────


async def check_savings_idle(
    user_id: UUID, now_utc: datetime, local_today: date, db: AsyncSession
) -> None:
    """Un rappel par objectif et par mois si rien n'a été versé depuis 30 jours."""
    goals = (
        await db.execute(
            select(SavingsGoal).where(SavingsGoal.user_id == user_id, SavingsGoal.active.is_(True))
        )
    ).scalars().all()
    if not goals:
        return
    user = await db.get(User, user_id)
    currency = user.currency if user else ""
    period = period_of(local_today)
    for goal in goals:
        goal_id, name, target, deadline = goal.id, goal.name, goal.target_amount, goal.deadline
        if not target or deadline <= local_today:
            continue
        total, last = (
            await db.execute(
                select(
                    func.coalesce(func.sum(SavingsContribution.amount), Decimal("0")),
                    func.max(SavingsContribution.created_at),
                ).where(SavingsContribution.savings_goal_id == goal_id)
            )
        ).one()
        if total >= target:
            continue
        last_activity = last or goal.created_at
        if last_activity is None:
            continue
        if last_activity.tzinfo is None:
            last_activity = last_activity.replace(tzinfo=timezone.utc)
        idle_days = (now_utc - last_activity).days
        if idle_days < SAVINGS_IDLE_DAYS:
            continue
        if not await _claim(db, user_id, f"savings-idle:{goal_id}:{period}"):
            continue
        months_left = max((deadline - local_today).days / 30.4375, 1)
        needed = (target - total) / Decimal(str(months_left))
        await push_service.send_to_user(
            user_id,
            f"Objectif « {name} » en pause",
            f"Aucun versement depuis {idle_days} jours. Pour atteindre "
            f"{_money(target, currency)} d'ici {deadline.strftime('%m/%Y')}, "
            f"prévoyez ≈ {_money(needed, currency)} par mois.",
            db,
            {"route": "/savings", "kind": "savings_idle"},
        )


# ── Tâche planifiée ──────────────────────────────────────────────────────


async def run_scheduled(now_utc: datetime, db: AsyncSession, provider: Any = None) -> None:
    """Un passage : envoie ce qui est dû à chaque utilisateur ayant un appareil enregistré."""
    user_ids = (await db.execute(select(distinct(PushDevice.user_id)))).scalars().all()
    for user_id in user_ids:
        try:
            prefs = await push_service.get_preferences(user_id, db)
            await db.commit()
            tz, daily, daily_hour = prefs.timezone, prefs.daily_reminder, prefs.daily_reminder_hour
            weekly, ai = prefs.weekly_summary, prefs.ai_insights
            local = _local_now(now_utc, tz)
            today = local.date()
            if daily and local.hour == daily_hour:
                await send_daily_reminder(user_id, today, db)
            if local.hour in DAY_HOURS:
                if prefs.budget_alerts:
                    await check_budget_catchup(user_id, today, db)
                    await check_month_budget(user_id, today, db)
                if prefs.savings_milestones:
                    await check_savings_idle(user_id, now_utc, today, db)
            if local.weekday() == SUNDAY and local.hour >= WEEKLY_HOUR:
                if weekly:
                    await send_weekly_summary(user_id, today, db)
                if ai and provider is not None:
                    await send_ai_insight(user_id, today, db, provider)
        except Exception:
            await db.rollback()
            log.exception("Échec des notifications planifiées pour %s", user_id)


async def scheduler_loop() -> None:
    from app.services.ai import get_provider

    while True:
        try:
            async with get_session_factory()() as db:
                await run_scheduled(datetime.now(timezone.utc), db, get_provider())
        except Exception:
            log.exception("Échec de la tâche planifiée de notifications")
        await asyncio.sleep(settings.scheduler_interval_seconds)


# ── Déclenchement sans bloquer la réponse HTTP ───────────────────────────

_tasks: set[asyncio.Task] = set()


def _spawn(job: Callable[..., Awaitable[None]], *args: Any) -> None:
    async def runner() -> None:
        try:
            async with get_session_factory()() as db:
                await job(*args, db)
        except Exception:
            log.exception("Échec d'une notification en arrière-plan")

    task = asyncio.create_task(runner())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


def schedule_budget_alerts(user_id: UUID, pairs: set[tuple[UUID, str]]) -> None:
    if settings.push_enabled and pairs:
        _spawn(check_budget_alerts, user_id, pairs)


def schedule_savings_milestone(user_id: UUID, goal_id: UUID) -> None:
    if settings.push_enabled:
        _spawn(check_savings_milestone, user_id, goal_id)
