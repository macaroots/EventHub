from __future__ import annotations

import pytest

from app.application.events import parse_event
from app.domain.errors import BadRequestError


def test_parses_event_created_with_defaults() -> None:
    parsed = parse_event(
        {
            "type": "EventCreated",
            "eventId": "event-1",
            "name": "Congresso",
            "startDate": "2026-11-07",
            "organizers": ["org-1"],
        }
    )

    assert parsed.type == "EventCreated"
    assert parsed.message_id is None
    assert parsed.occurred_at is None
    assert parsed.data == {
        "eventId": "event-1",
        "name": "Congresso",
        "information": None,
        "startDate": "2026-11-07",
        "endDate": None,
        "status": "draft",
        "organizers": ["org-1"],
    }


def test_occurred_at_is_normalized_to_utc() -> None:
    parsed = parse_event(
        {
            "type": "EventCreated",
            "eventId": "event-1",
            "name": "Congresso",
            "occurredAt": "2026-11-07T10:00:00-03:00",
            "messageId": "msg-1",
        }
    )

    assert parsed.occurred_at == "2026-11-07T13:00:00.000Z"
    assert parsed.message_id == "msg-1"


def test_registration_created_accepts_registered_alias() -> None:
    parsed = parse_event(
        {
            "type": "RegistrationCreated",
            "id": "reg-1",
            "userId": "user-1",
            "activityId": "act-1",
            "status": "registered",
        }
    )

    assert parsed.data["status"] == "pending"
    assert parsed.data["eventId"] is None
    assert parsed.data["requirements"] == []


def test_payment_confirmed_is_accepted_as_approved() -> None:
    parsed = parse_event(
        {
            "type": "PaymentConfirmed",
            "paymentId": "pay-1",
            "registrationId": "reg-1",
            "amount": 100.5,
        }
    )

    assert parsed.data == {
        "paymentId": "pay-1",
        "registrationId": "reg-1",
        "amountCents": 10050,
    }


def test_unknown_event_type_is_accepted_with_empty_data() -> None:
    parsed = parse_event({"type": "SomethingNew", "payload": {"x": 1}})

    assert parsed.type == "SomethingNew"
    assert parsed.data == {}


def test_event_created_requires_name() -> None:
    with pytest.raises(BadRequestError) as exc:
        parse_event({"type": "EventCreated", "eventId": "event-1"})

    assert "name is required" in exc.value.message


def test_activity_rejects_negative_capacity() -> None:
    with pytest.raises(BadRequestError) as exc:
        parse_event(
            {
                "type": "ActivityCreated",
                "activityId": "act-1",
                "eventId": "event-1",
                "name": "Minicurso",
                "capacity": -1,
            }
        )

    assert "capacity must be >= 0" in exc.value.message


def test_payment_rejects_negative_amount() -> None:
    with pytest.raises(BadRequestError) as exc:
        parse_event(
            {
                "type": "PaymentRequested",
                "paymentId": "pay-1",
                "registrationId": "reg-1",
                "amount": -0.01,
            }
        )

    assert "amount must be >= 0" in exc.value.message


def test_registration_rejects_unknown_status() -> None:
    with pytest.raises(BadRequestError) as exc:
        parse_event(
            {
                "type": "RegistrationCreated",
                "id": "reg-1",
                "userId": "user-1",
                "activityId": "act-1",
                "status": "waiting",
            }
        )

    assert "status must be one of" in exc.value.message


def test_checked_in_requires_checked_in_at() -> None:
    with pytest.raises(BadRequestError) as exc:
        parse_event(
            {
                "type": "UserCheckedIn",
                "activityId": "act-1",
                "userId": "user-1",
            }
        )

    assert "checkedInAt is required" in exc.value.message


def test_payload_must_be_an_object() -> None:
    with pytest.raises(BadRequestError):
        parse_event(["not", "an", "object"])

    with pytest.raises(BadRequestError):
        parse_event({"eventId": "event-1"})
