"""Indicateurs du backoffice : utilisateurs, activité, notifications, saisies.

« Actif » = au moins une requête authentifiée de l'app ce jour-là (table user_activity_days).
Chaque indicateur est une agrégation SQL ; la série quotidienne tient en trois requêtes GROUP BY.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Expense, NotificationLog, PushDevice, User, UserActivityDay

SERIES_DAYS = 30


async def _scalar(db: AsyncSession, stmt: Any) -> int:
    return int((await db.execute(stmt)).scalar_one() or 0)


async def _active_between(db: AsyncSession, start: date, end: date) -> int:
    """Utilisateurs distincts actifs entre start et end inclus."""
    return await _scalar(
        db,
        select(func.count(distinct(UserActivityDay.user_id))).where(
            UserActivityDay.day.between(start, end)
        ),
    )


def _delta(current: int, previous: int) -> float | None:
    """Variation relative (0.12 = +12 %) ; None sans base de comparaison."""
    if previous == 0:
        return None
    return round((current - previous) / previous, 4)


def notification_kind(key: str) -> str:
    """Type d'une notification d'après sa clé (`budget:…`, `month:…`, `admin:…`)."""
    return key.split(":", 1)[0]


def _utc_day(db: AsyncSession, column: Any) -> Any:
    """Jour UTC d'un horodatage, quel que soit le fuseau de la session PostgreSQL."""
    if db.get_bind().dialect.name == "postgresql":
        return func.date(func.timezone("UTC", column))
    return func.date(column)  # SQLite (tests) : horodatages stockés en UTC


def _midnight(day: date) -> datetime:
    return datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)


async def overview(db: AsyncSession, today: date | None = None) -> dict[str, Any]:
    """KPI des 30 derniers jours, comparés aux 30 jours précédents, et séries quotidiennes."""
    today = today or datetime.now(timezone.utc).date()
    d30 = today - timedelta(days=SERIES_DAYS - 1)
    prev_start, prev_end = d30 - timedelta(days=SERIES_DAYS), d30 - timedelta(days=1)
    since30, prev_since = _midnight(d30), _midnight(prev_start)

    users_total = await _scalar(db, select(func.count()).select_from(User))
    new_30 = await _scalar(db, select(func.count()).select_from(User).where(User.created_at >= since30))
    new_prev = await _scalar(
        db,
        select(func.count()).select_from(User).where(
            User.created_at >= prev_since, User.created_at < since30
        ),
    )
    active_today = await _active_between(db, today, today)
    active_7 = await _active_between(db, today - timedelta(days=6), today)
    active_30 = await _active_between(db, d30, today)
    active_prev = await _active_between(db, prev_start, prev_end)
    devices = await _scalar(db, select(func.count()).select_from(PushDevice))
    users_push = await _scalar(db, select(func.count(distinct(PushDevice.user_id))))
    notifs_30 = await _scalar(
        db,
        select(func.count()).select_from(NotificationLog).where(NotificationLog.created_at >= since30),
    )
    notifs_prev = await _scalar(
        db,
        select(func.count()).select_from(NotificationLog).where(
            NotificationLog.created_at >= prev_since, NotificationLog.created_at < since30
        ),
    )
    expenses_30 = await _scalar(
        db, select(func.count()).select_from(Expense).where(Expense.expense_date.between(d30, today))
    )

    active_rows = await db.execute(
        select(UserActivityDay.day, func.count())
        .where(UserActivityDay.day >= d30)
        .group_by(UserActivityDay.day)
    )
    signup_day = _utc_day(db, User.created_at)
    signup_rows = await db.execute(
        select(signup_day, func.count()).where(User.created_at >= since30).group_by(signup_day)
    )
    notif_day = _utc_day(db, NotificationLog.created_at)
    notif_rows = await db.execute(
        select(notif_day, func.count())
        .where(NotificationLog.created_at >= since30)
        .group_by(notif_day)
    )

    def by_day(rows: Any) -> dict[str, int]:
        return {str(day): int(n) for day, n in rows.all()}

    active_map, signup_map, notif_map = by_day(active_rows), by_day(signup_rows), by_day(notif_rows)
    series = []
    for i in range(SERIES_DAYS):
        day = (d30 + timedelta(days=i)).isoformat()
        series.append(
            {
                "day": day,
                "active": active_map.get(day, 0),
                "signups": signup_map.get(day, 0),
                "notifications": notif_map.get(day, 0),
            }
        )

    return {
        "generated_at": datetime.now(timezone.utc),
        "users_total": users_total,
        "users_new_30d": new_30,
        "users_new_delta": _delta(new_30, new_prev),
        "active_today": active_today,
        "active_7d": active_7,
        "active_30d": active_30,
        "active_30d_delta": _delta(active_30, active_prev),
        "push_devices": devices,
        "users_with_push": users_push,
        "notifications_30d": notifs_30,
        "notifications_delta": _delta(notifs_30, notifs_prev),
        "expenses_30d": expenses_30,
        "series": series,
    }
