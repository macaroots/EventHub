from __future__ import annotations

from app.domain.metrics import (
    event_attendance_rate,
    no_show,
    payment_summary,
    percent,
    registration_counts,
)
from app.domain.models import Attendance, Payment, Registration


def registration(status: str, user_id: str = "user-1", activity_id: str = "act-1"):
    return Registration(
        id=f"reg-{status}-{user_id}-{activity_id}",
        activity_id=activity_id,
        user_id=user_id,
        status=status,
    )


def test_percent_handles_zero_denominator() -> None:
    assert percent(1, 2) == 50.0
    assert percent(2, 3) == 66.67
    assert percent(0, 0) is None
    assert no_show(66.67) == 33.33
    assert no_show(None) is None


def test_registration_counts_separates_all_and_active() -> None:
    counts = registration_counts(
        [
            registration("pending"),
            registration("confirmed"),
            registration("canceled"),
            registration("confirmed", user_id="user-2"),
        ]
    )

    assert counts == {
        "all": 4,
        "active": 3,
        "pending": 1,
        "confirmed": 2,
        "canceled": 1,
    }


def test_event_attendance_rate_uses_distinct_users() -> None:
    registrations = [
        registration("confirmed", user_id="user-1", activity_id="act-1"),
        registration("confirmed", user_id="user-1", activity_id="act-2"),
        registration("confirmed", user_id="user-2", activity_id="act-1"),
        registration("pending", user_id="user-3", activity_id="act-1"),
    ]
    attendances = [
        Attendance(
            activity_id="act-1",
            user_id="user-1",
            checked_in_at="2026-11-01T10:00:00Z",
        ),
        Attendance(
            activity_id="act-2",
            user_id="user-1",
            checked_in_at="2026-11-01T10:00:00Z",
        ),
    ]

    assert event_attendance_rate(registrations, attendances) == 50.0


def test_event_attendance_rate_is_none_without_confirmed_registrations() -> None:
    assert event_attendance_rate([], []) is None


def test_payment_summary_counts_and_amounts() -> None:
    summary = payment_summary(
        [
            Payment(id="pay-1", amount_cents=10000, status="approved"),
            Payment(id="pay-2", amount_cents=5000, status="requested"),
            Payment(id="pay-3", amount_cents=2500, status="denied"),
        ],
        "BRL",
    )

    assert summary == {
        "requested": 1,
        "approved": 1,
        "denied": 1,
        "expectedAmount": 175.0,
        "approvedAmount": 100.0,
        "currency": "BRL",
    }
