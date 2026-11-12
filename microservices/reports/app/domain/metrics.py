from __future__ import annotations

from collections import Counter
from typing import Iterable

from .models import Attendance, Payment, Registration


def percent(numerator: int | float, denominator: int | float) -> float | None:
    if not denominator:
        return None
    return round(float(numerator) * 100.0 / float(denominator), 2)


def no_show(attendance_rate: float | None) -> float | None:
    if attendance_rate is None:
        return None
    return round(100.0 - attendance_rate, 2)


def registration_counts(registrations: Iterable[Registration]) -> dict[str, int]:
    items = list(registrations)
    by_status = Counter(item.status for item in items)

    # ``registered`` is an alias accepted from older publishers.
    pending = by_status.get("pending", 0) + by_status.get("registered", 0)
    confirmed = by_status.get("confirmed", 0)
    canceled = by_status.get("canceled", 0)

    return {
        "all": len(items),
        "active": pending + confirmed,
        "pending": pending,
        "confirmed": confirmed,
        "canceled": canceled,
    }


def event_attendance_rate(
    registrations: Iterable[Registration],
    attendances: Iterable[Attendance],
) -> float | None:
    confirmed_users = {item.user_id for item in registrations if item.status == "confirmed"}
    attended_users = {item.user_id for item in attendances}
    return percent(len(confirmed_users & attended_users), len(confirmed_users))


def payment_summary(payments: Iterable[Payment], currency: str) -> dict:
    items = list(payments)
    by_status = Counter(item.status for item in items)

    expected_cents = sum(item.amount_cents for item in items)
    approved_cents = sum(
        item.amount_cents for item in items if item.status == "approved"
    )

    return {
        "requested": by_status.get("requested", 0),
        "approved": by_status.get("approved", 0),
        "denied": by_status.get("denied", 0),
        "expectedAmount": round(expected_cents / 100.0, 2),
        "approvedAmount": round(approved_cents / 100.0, 2),
        "currency": currency,
    }
