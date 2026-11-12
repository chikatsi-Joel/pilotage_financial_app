"""Événements de notification : alertes budget, paliers d'épargne, rappel quotidien,
résumé hebdomadaire et conseil de l'IA.

Chaque notification passe par `_claim` : une clé unique (par utilisateur) garantit
qu'elle n'est envoyée qu'une fois, même si la tâche planifiée tourne plusieurs fois.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterable
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Awaitable, Callable
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import delete, distinct, extract, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_session_factory
from app.models import (
    Budget,
    Category,
    Expense,
    NotificationLog,
    NotificationPreference,
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
    return f"{_amount(amount)} {currency}".rstrip()


def _amount(amount: Decimal | float) -> str:
    """Montant sans devise, espaces pour les milliers : « 49 825 »."""
    return f"{Decimal(str(amount)):,.0f}".replace(",", " ")


def _local_now(now_utc: datetime, tz_name: str) -> datetime:
    try:
        return now_utc.astimezone(ZoneInfo(tz_name))
    except (ZoneInfoNotFoundError, ValueError):
        return now_utc.astimezone(ZoneInfo("UTC"))


async def _sent_keys(db: AsyncSession, user_id: UUID, keys: Iterable[str]) -> set[str]:
    """Clés déjà réservées parmi `keys`, en une seule requête."""
    wanted = list(dict.fromkeys(keys))
    if not wanted:
        return set()
    rows = await db.execute(
        select(NotificationLog.key).where(
            NotificationLog.user_id == user_id, NotificationLog.key.in_(wanted)
        )
    )
    return set(rows.scalars().all())


async def _claim(
    db: AsyncSession, user_id: UUID, key: str, sent: set[str] | None = None
) -> bool:
    """Réserve la clé ; False si cette notification a déjà été envoyée.

    `sent` (clés déjà réservées, lues d'avance par `_sent_keys`) évite, à chaque passage de la
    tâche planifiée, un INSERT voué à l'échec suivi d'un rollback. La contrainte unique reste
    l'arbitre en cas de course entre deux passages simultanés.
    """
    if sent is None:
        sent = await _sent_keys(db, user_id, [key])
    if key in sent:
        return False
    db.add(NotificationLog(user_id=user_id, key=key))
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return False
    return True


async def _claim_all(db: AsyncSession, user_id: UUID, keys: list[str]) -> list[bool]:
    """Réserve chaque clé, dans l'ordre ; une seule lecture des clés déjà envoyées."""
    sent = await _sent_keys(db, user_id, keys)
    return [await _claim(db, user_id, k, sent) for k in keys]


async def _deliver(
    db: AsyncSession,
    user_id: UUID,
    keys: list[str],
    title: str,
    body: str,
    data: dict[str, str],
) -> None:
    """Envoie la notification ; si l'envoi échoue (réseau, service Expo), libère les clés
    réservées pour qu'elle reparte au passage suivant au lieu d'être perdue."""
    if await push_service.send_to_user(user_id, title, body, db, data):
        return
    if not keys or not await _has_devices(db, user_id):
        return  # aucun appareil : rien à rattraper
    await db.execute(
        delete(NotificationLog).where(
            NotificationLog.user_id == user_id, NotificationLog.key.in_(keys)
        )
    )
    await db.commit()


async def _has_devices(db: AsyncSession, user_id: UUID) -> bool:
    count = (
        await db.execute(
            select(func.count()).select_from(PushDevice).where(PushDevice.user_id == user_id)
        )
    ).scalar_one()
    return count > 0


async def _push_context(
    db: AsyncSession, user_id: UUID, preference: Any
) -> tuple[bool, str]:
    """(notification à envoyer ?, devise) en une seule requête : appareil enregistré,
    préférence `preference` (activée par défaut si l'utilisateur n'a pas encore de
    préférences) et devise de l'utilisateur. Valeurs brutes : rien à expirer ensuite."""
    has_device, enabled, currency = (
        await db.execute(
            select(
                select(PushDevice.id).where(PushDevice.user_id == user_id).exists(),
                select(preference)
                .where(NotificationPreference.user_id == user_id)
                .scalar_subquery(),
                select(User.currency).where(User.id == user_id).scalar_subquery(),
            )
        )
    ).one()
    # Pas encore de préférences : valeurs par défaut (alertes activées), comme get_preferences.
    return bool(has_device) and (enabled is None or bool(enabled)), currency or ""


# ── Alertes budget ───────────────────────────────────────────────────────


async def check_budget_alerts(
    user_id: UUID, pairs: set[tuple[UUID, str]], db: AsyncSession
) -> None:
    """Après une dépense : prévient quand une catégorie atteint 80 % puis 100 % de son budget."""
    enabled, currency = await _push_context(db, user_id, NotificationPreference.budget_alerts)
    if not enabled or not pairs:
        return

    # Valeurs brutes lues d'avance (pas d'objets ORM) : un rollback de `_claim` expirerait les
    # objets chargés et un accès paresseux ensuite lèverait MissingGreenlet.
    categories = {
        cid: (name, budget)
        for cid, name, budget in (
            await db.execute(
                select(Category.id, Category.name, Category.monthly_budget).where(
                    Category.user_id == user_id,
                    Category.id.in_({cid for cid, _ in pairs}),
                )
            )
        ).all()
        if budget and budget > 0
    }
    if not categories:
        return

    # Dépensé par (catégorie, mois) pour toutes les paires : un seul GROUP BY
    bounds = [month_bounds(period) for _, period in pairs]
    year = extract("year", Expense.expense_date)
    month = extract("month", Expense.expense_date)
    spent_by_pair = {
        (cid, f"{int(y):04d}-{int(m):02d}"): total
        for cid, y, m, total in (
            await db.execute(
                select(Expense.category_id, year, month, func.sum(Expense.amount))
                .where(
                    Expense.user_id == user_id,
                    Expense.category_id.in_(list(categories)),
                    Expense.expense_date.between(
                        min(s for s, _ in bounds), max(e for _, e in bounds)
                    ),
                )
                .group_by(Expense.category_id, year, month)
            )
        ).all()
    }

    alerts = []
    for category_id, period in pairs:
        if category_id not in categories:
            continue
        category_name, budget = categories[category_id]
        spent = spent_by_pair.get((category_id, period), Decimal("0"))
        ratio = spent / budget * 100
        crossed = [t for t in BUDGET_THRESHOLDS if ratio >= t]
        if crossed:
            alerts.append((category_id, period, category_name, budget, spent, ratio, crossed))
    if not alerts:
        return

    sent = await _sent_keys(
        db,
        user_id,
        [f"budget:{a[0]}:{a[1]}:{t}" for a in alerts for t in a[6]],
    )
    for category_id, period, category_name, budget, spent, ratio, crossed in alerts:
        # Tous les paliers franchis sont réservés ; seul le plus haut est annoncé.
        keys = [f"budget:{category_id}:{period}:{t}" for t in crossed]
        claimed = [await _claim(db, user_id, k, sent) for k in keys]
        if not claimed[-1]:
            continue
        top = crossed[-1]
        used = f"Dépensé {_amount(spent)} / {_money(budget, currency)}"
        if top >= 100:
            title = f"🚨 {category_name} — budget dépassé"
            body = f"+{_money(spent - budget, currency)} au-delà du budget\n{used}"
        else:
            title = f"⚠️ {category_name} — {round(ratio)} % du budget"
            body = f"Reste {_money(budget - spent, currency)} jusqu'à la fin du mois\n{used}"
        await _deliver(
            db,
            user_id,
            [k for k, c in zip(keys, claimed) if c],
            title,
            body,
            {"route": "/budget", "kind": "budget", "sticker": "alert" if top >= 100 else "warning"},
        )


# ── Objectifs d'épargne ──────────────────────────────────────────────────


async def check_savings_milestone(user_id: UUID, goal_id: UUID, db: AsyncSession) -> None:
    enabled, currency = await _push_context(
        db, user_id, NotificationPreference.savings_milestones
    )
    if not enabled:
        return
    goal = (
        await db.execute(
            select(
                SavingsGoal.name,
                SavingsGoal.target_amount,
                func.coalesce(func.sum(SavingsContribution.amount), Decimal("0")),
            )
            .outerjoin(
                SavingsContribution, SavingsContribution.savings_goal_id == SavingsGoal.id
            )
            .where(SavingsGoal.id == goal_id, SavingsGoal.user_id == user_id)
            .group_by(SavingsGoal.id, SavingsGoal.name, SavingsGoal.target_amount)
        )
    ).first()
    if goal is None or not goal[1]:
        return
    goal_name, target, total = goal
    ratio = total / target * 100
    crossed = [t for t in SAVINGS_THRESHOLDS if ratio >= t]
    if not crossed:
        return
    keys = [f"savings:{goal_id}:{t}" for t in crossed]
    claimed = await _claim_all(db, user_id, keys)
    if not claimed[-1]:
        return
    top = crossed[-1]
    saved = f"Épargné {_amount(total)} / {_money(target, currency)}"
    if top >= 100:
        title = f"🎉 {goal_name} — objectif atteint !"
        body = f"Cible de {_money(target, currency)} atteinte, bravo\n{saved}"
    else:
        title = f"🎯 {goal_name} — {top} % de l'objectif"
        body = f"Reste {_money(target - total, currency)} à épargner\n{saved}"
    await _deliver(
        db,
        user_id,
        [k for k, c in zip(keys, claimed) if c],
        title,
        body,
        {"route": "/savings", "kind": "savings", "sticker": "reached" if top >= 100 else "milestone"},
    )


# ── Rappel quotidien ─────────────────────────────────────────────────────


async def send_daily_reminder(user_id: UUID, local_today: date, db: AsyncSession) -> None:
    key = f"daily:{local_today.isoformat()}"
    if not await _claim(db, user_id, key):
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
    await _deliver(
        db,
        user_id,
        [key],
        "📝 Dépenses du jour — rien de noté",
        "Aucune dépense enregistrée aujourd'hui\n30 secondes pour garder un suivi exact",
        {"route": "/add-expense", "kind": "daily", "sticker": "daily"},
    )


# ── Résumé hebdomadaire + conseil IA ─────────────────────────────────────


async def send_weekly_summary(user_id: UUID, local_today: date, db: AsyncSession) -> None:
    iso = local_today.isocalendar()
    key = f"weekly:{iso.year}-W{iso.week:02d}"
    if not await _claim(db, user_id, key):
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

    parts = [f"Dépensé {_money(week_total, currency)} cette semaine"]
    if top:
        parts.append(f"Plus gros poste : {top[0]}")
    balance = income - expenses
    parts.append(f"Solde du mois : {_money(balance, currency)}")
    await _deliver(
        db,
        user_id,
        [key],
        "📅 Résumé de la semaine",
        "\n".join(parts),
        {"route": "/dashboard", "kind": "weekly", "sticker": "weekly"},
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
    # Pas de nouvel essai : chaque essai relancerait l'analyse IA, qui est payante.
    await _deliver(
        db, user_id, [], "💡 Conseil de la semaine", body, {"route": "/analyse-insights", "kind": "ai", "sticker": "ai"}
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
    pace_due = (
        share < 1
        and PACE_WINDOW[0] <= time_share <= PACE_WINDOW[1]
        and share - time_share >= PACE_GAP
    )
    keys = [f"month:{period}:{t}" for t in crossed]
    # Une seule lecture des clés déjà envoyées (paliers + rythme)
    sent = await _sent_keys(db, user_id, keys + ([f"pace:{period}"] if pace_due else []))
    if crossed:
        claimed = [await _claim(db, user_id, k, sent) for k in keys]
        if claimed[-1]:
            top = crossed[-1]
            if top >= 100:
                title = "🚨 Budget du mois — dépassé"
                body = (
                    f"+{_money(spent - budget, currency)} au-delà du budget\n"
                    f"Dépensé {_amount(spent)} / {_money(budget, currency)}"
                )
            else:
                title = f"⚠️ Budget du mois — {round(share * 100)} % utilisé"
                body = (
                    f"Reste {_money(budget - spent, currency)} pour {days_left} jour"
                    f"{'s' if days_left > 1 else ''}\n"
                    f"Soit ≈ {_money((budget - spent) / days_left, currency)} par jour"
                )
            await _deliver(
                db,
                user_id,
                [k for k, c in zip(keys, claimed) if c],
                title,
                body,
                {
                    "route": "/dashboard",
                    "kind": "month_budget",
                    "sticker": "alert" if top >= 100 else "warning",
                },
            )
            return  # un seul message par passage

    if pace_due:
        if await _claim(db, user_id, f"pace:{period}", sent):
            per_day = (budget - spent) / days_left
            await _deliver(
                db,
                user_id,
                [f"pace:{period}"],
                "🏃 Rythme de dépense — trop rapide",
                f"{round(share * 100)} % du budget utilisé, {round(time_share * 100)} % du mois écoulé\n"
                f"Visez ≈ {_money(per_day, currency)} par jour pour tenir",
                {"route": "/dashboard", "kind": "pace", "sticker": "pace"},
            )


# ── Objectifs d'épargne sans versement ───────────────────────────────────


async def check_savings_idle(
    user_id: UUID, now_utc: datetime, local_today: date, db: AsyncSession
) -> None:
    """Un rappel par objectif et par mois si rien n'a été versé depuis 30 jours."""
    # Valeurs brutes (pas d'objets ORM) : le rollback de `_claim` expire les objets chargés
    # et un accès paresseux au tour suivant lèverait MissingGreenlet.
    # Total et dernier versement de chaque objectif : une requête (LEFT JOIN + GROUP BY)
    goals = (
        await db.execute(
            select(
                SavingsGoal.id, SavingsGoal.name, SavingsGoal.target_amount,
                SavingsGoal.deadline, SavingsGoal.created_at,
                func.coalesce(func.sum(SavingsContribution.amount), Decimal("0")),
                func.max(SavingsContribution.created_at),
            )
            .outerjoin(
                SavingsContribution, SavingsContribution.savings_goal_id == SavingsGoal.id
            )
            .where(SavingsGoal.user_id == user_id, SavingsGoal.active.is_(True))
            .group_by(
                SavingsGoal.id, SavingsGoal.name, SavingsGoal.target_amount,
                SavingsGoal.deadline, SavingsGoal.created_at,
            )
        )
    ).all()
    if not goals:
        return
    user = await db.get(User, user_id)
    currency = user.currency if user else ""
    period = period_of(local_today)
    sent = await _sent_keys(db, user_id, [f"savings-idle:{g[0]}:{period}" for g in goals])
    for goal_id, name, target, deadline, created_at, total, last in goals:
        if not target or deadline <= local_today:
            continue
        if total >= target:
            continue
        last_activity = last or created_at
        if last_activity is None:
            continue
        if last_activity.tzinfo is None:
            last_activity = last_activity.replace(tzinfo=timezone.utc)
        idle_days = (now_utc - last_activity).days
        if idle_days < SAVINGS_IDLE_DAYS:
            continue
        key = f"savings-idle:{goal_id}:{period}"
        if not await _claim(db, user_id, key, sent):
            continue
        months_left = max((deadline - local_today).days / 30.4375, 1)
        needed = (target - total) / Decimal(str(months_left))
        await _deliver(
            db,
            user_id,
            [key],
            f"💤 {name} — aucun versement depuis {idle_days} jours",
            f"Épargné {_amount(total)} / {_money(target, currency)}\n"
            f"Prévoyez ≈ {_money(needed, currency)} par mois d'ici {deadline.strftime('%m/%Y')}",
            {"route": "/savings", "kind": "savings_idle", "sticker": "idle"},
        )


# ── Tâche planifiée ──────────────────────────────────────────────────────


async def run_scheduled(now_utc: datetime, db: AsyncSession, provider: Any = None) -> None:
    """Un passage : envoie ce qui est dû à chaque utilisateur ayant un appareil enregistré."""
    user_ids = (await db.execute(select(distinct(PushDevice.user_id)))).scalars().all()
    for user_id in user_ids:
        try:
            prefs = await push_service.get_preferences(user_id, db)
            await db.commit()
            # Tout lire maintenant : chaque envoi fait un commit qui expire `prefs`,
            # et un accès paresseux ensuite lève MissingGreenlet en asynchrone.
            tz, daily, daily_hour = prefs.timezone, prefs.daily_reminder, prefs.daily_reminder_hour
            weekly, ai = prefs.weekly_summary, prefs.ai_insights
            budget_alerts, savings_milestones = prefs.budget_alerts, prefs.savings_milestones
            local = _local_now(now_utc, tz)
            today = local.date()
            if daily and local.hour == daily_hour:
                await send_daily_reminder(user_id, today, db)
            if local.hour in DAY_HOURS:
                if budget_alerts:
                    await check_budget_catchup(user_id, today, db)
                    await check_month_budget(user_id, today, db)
                if savings_milestones:
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
