from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Mapping

from ..domain.errors import BadRequestError

EVENT_TYPES: tuple[str, ...] = (
    "EventCreated",
    "EventUpdated",
    "EventPublished",
    "EventCanceled",
    "EventDeleted",
    "ActivityCreated",
    "ActivityUpdated",
    "ActivityDeleted",
    "RegistrationCreated",
    "RegistrationConfirmed",
    "RegistrationPromoted",
    "RegistrationCanceled",
    "PaymentRequested",
    "PaymentApproved",
    "PaymentConfirmed",
    "PaymentDenied",
    "UserCheckedIn",
    "AttendanceRegistered",
    "UserRegistered",
    "EventOrganizersChanged",
    "EventEnded",
    "UserCreated",
    "UserUpdated",
)

EVENT_STATUSES = {"draft", "published", "canceled", "ended"}
REGISTRATION_STATUSES = {"pending", "confirmed", "canceled", "waitlisted"}
PAYMENT_STATUSES = {"requested", "approved", "denied"}

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@dataclass(frozen=True, slots=True)
class ParsedEvent:
    """Validated event envelope plus normalized domain payload."""

    type: str
    message_id: str | None
    occurred_at: str | None
    data: dict[str, Any]


def _required_str(payload: Mapping[str, Any], field: str) -> str:
    value = payload.get(field)
    if value is None or str(value).strip() == "":
        raise BadRequestError(f"{field} is required")
    return str(value).strip()


def _optional_str(payload: Mapping[str, Any], field: str) -> str | None:
    if field not in payload or payload[field] is None:
        return None
    value = str(payload[field]).strip()
    return value or None


def _optional_text(payload: Mapping[str, Any], field: str) -> str | None:
    """Optional string that must not be blank when explicitly present."""

    if field not in payload or payload[field] is None:
        return None
    value = str(payload[field]).strip()
    if not value:
        raise BadRequestError(f"{field} must not be blank")
    return value


def _optional_list(payload: Mapping[str, Any], field: str) -> list[Any] | None:
    if field not in payload or payload[field] is None:
        return None
    value = payload[field]
    if not isinstance(value, (list, tuple)):
        raise BadRequestError(f"{field} must be a list")
    return list(value)


def _optional_string_list(
    payload: Mapping[str, Any],
    field: str,
    *,
    default: list[str] | None = None,
) -> list[str] | None:
    if field not in payload or payload[field] is None:
        return default
    value = payload[field]
    if not isinstance(value, (list, tuple)):
        raise BadRequestError(f"{field} must be a list")

    items: list[str] = []
    for item in value:
        if isinstance(item, Mapping):
            item = item.get("userId") or item.get("id") or item.get("name")
        if item is None or str(item).strip() == "":
            raise BadRequestError(f"{field} must contain non-empty strings")
        items.append(str(item).strip())
    return items


def _normalize_iso(value: Any, field: str) -> str:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        parsed = datetime(value.year, value.month, value.day, tzinfo=timezone.utc)
    else:
        text = str(value).strip()
        if not text:
            raise BadRequestError(f"{field} must be an ISO date or datetime")
        try:
            parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        except ValueError as exc:
            raise BadRequestError(
                f"{field} must be an ISO date or datetime"
            ) from exc

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    parsed = parsed.astimezone(timezone.utc)
    return parsed.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _optional_datetime(payload: Mapping[str, Any], field: str) -> str | None:
    if field not in payload or payload[field] is None:
        return None
    return _normalize_iso(payload[field], field)


def _required_datetime(payload: Mapping[str, Any], field: str) -> str:
    value = payload.get(field)
    if value is None or str(value).strip() == "":
        raise BadRequestError(f"{field} is required")
    return _normalize_iso(value, field)


def _optional_date(payload: Mapping[str, Any], field: str) -> str | None:
    value = _optional_str(payload, field)
    if value is None:
        return None
    if _ISO_DATE.match(value):
        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise BadRequestError(f"{field} must be an ISO date") from exc
        return value
    return _normalize_iso(value, field)


def _optional_int(
    payload: Mapping[str, Any],
    field: str,
    *,
    default: int | None = None,
    minimum: int = 0,
) -> int | None:
    if field not in payload or payload[field] is None:
        return default
    value = payload[field]
    if isinstance(value, bool):
        raise BadRequestError(f"{field} must be an integer")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise BadRequestError(f"{field} must be an integer") from exc
    if parsed < minimum:
        raise BadRequestError(f"{field} must be >= {minimum}")
    return parsed


def _money_to_cents(value: Any, field: str) -> int:
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise BadRequestError(f"{field} must be a number") from exc
    if amount < 0:
        raise BadRequestError(f"{field} must be >= 0")
    return int((amount * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _optional_money_cents(
    payload: Mapping[str, Any],
    field: str,
    *,
    default: int | None = None,
) -> int | None:
    if field not in payload or payload[field] is None:
        return default
    return _money_to_cents(payload[field], field)


def _status(
    payload: Mapping[str, Any],
    field: str,
    allowed: set[str],
    *,
    default: str | None = None,
    aliases: Mapping[str, str] | None = None,
) -> str | None:
    value = _optional_text(payload, field)
    if value is None:
        return default
    value = value.lower()
    if aliases and value in aliases:
        value = aliases[value]
    if value not in allowed:
        allowed_text = ", ".join(sorted(allowed))
        raise BadRequestError(f"{field} must be one of: {allowed_text}")
    return value


def _parse_event_created(payload: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "eventId": _required_str(payload, "eventId"),
        "name": _required_str(payload, "name"),
        "information": _optional_str(payload, "information"),
        "startDate": _optional_date(payload, "startDate"),
        "endDate": _optional_date(payload, "endDate"),
        "status": _status(payload, "status", EVENT_STATUSES, default="draft"),
        "organizers": _optional_string_list(payload, "organizers", default=[]),
    }


def _parse_event_updated(payload: Mapping[str, Any]) -> dict[str, Any]:
    data: dict[str, Any] = {"eventId": _required_str(payload, "eventId")}
    if "name" in payload:
        data["name"] = _optional_text(payload, "name")
    if "information" in payload:
        data["information"] = _optional_str(payload, "information")
    if "startDate" in payload:
        data["startDate"] = _optional_date(payload, "startDate")
    if "endDate" in payload:
        data["endDate"] = _optional_date(payload, "endDate")
    if "status" in payload:
        data["status"] = _status(payload, "status", EVENT_STATUSES)
    if "organizers" in payload:
        data["organizers"] = _optional_string_list(payload, "organizers", default=[])
    return data


def _parse_event_published(payload: Mapping[str, Any]) -> dict[str, Any]:
    data = _parse_event_updated(payload)
    data["status"] = "published"
    return data


def _parse_event_canceled(payload: Mapping[str, Any]) -> dict[str, Any]:
    data = _parse_event_updated(payload)
    data["status"] = "canceled"
    data["cancelReason"] = _optional_str(payload, "reason")
    return data


def _parse_event_deleted(payload: Mapping[str, Any]) -> dict[str, Any]:
    return {"eventId": _required_str(payload, "eventId")}


def _parse_activity_created(payload: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "activityId": _required_str(payload, "activityId"),
        "eventId": _required_str(payload, "eventId"),
        "name": _required_str(payload, "name"),
        "description": _optional_str(payload, "description"),
        "location": _optional_str(payload, "location"),
        "startsAt": _optional_datetime(payload, "startsAt"),
        "endsAt": _optional_datetime(payload, "endsAt"),
        "capacity": _optional_int(payload, "capacity", default=0),
        "priceCents": _optional_money_cents(payload, "price", default=0),
        "rules": _optional_list(payload, "rules") or [],
    }


def _parse_activity_updated(payload: Mapping[str, Any]) -> dict[str, Any]:
    data: dict[str, Any] = {"activityId": _required_str(payload, "activityId")}
    for field in ("name", "description", "location"):
        if field in payload:
            data[field] = _optional_str(payload, field) if field != "name" else _optional_text(payload, field)
    if "eventId" in payload:
        data["eventId"] = _optional_text(payload, "eventId")
    if "startsAt" in payload:
        data["startsAt"] = _optional_datetime(payload, "startsAt")
    if "endsAt" in payload:
        data["endsAt"] = _optional_datetime(payload, "endsAt")
    if "capacity" in payload:
        data["capacity"] = _optional_int(payload, "capacity", minimum=0)
    if "price" in payload:
        data["priceCents"] = _optional_money_cents(payload, "price")
    if "rules" in payload:
        data["rules"] = _optional_list(payload, "rules") or []
    return data


def _parse_activity_deleted(payload: Mapping[str, Any]) -> dict[str, Any]:
    return {"activityId": _required_str(payload, "activityId")}


def _parse_registration_created(payload: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "id": _required_str(payload, "id"),
        "userId": _required_str(payload, "userId"),
        "activityId": _required_str(payload, "activityId"),
        "eventId": _optional_str(payload, "eventId"),
        "status": _status(
            payload,
            "status",
            REGISTRATION_STATUSES,
            default="pending",
            aliases={"registered": "pending", "awaiting_payment": "pending"},
        ),
        "requirements": _optional_list(payload, "requirements") or [],
        "reasons": _optional_list(payload, "reasons") or [],
    }


def _parse_registration_confirmed(payload: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "registrationId": _required_str(payload, "registrationId"),
        "userId": _optional_str(payload, "userId"),
        "eventId": _optional_str(payload, "eventId"),
    }


def _parse_registration_canceled(payload: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "registrationId": _required_str(payload, "registrationId"),
        "userId": _optional_str(payload, "userId"),
        "eventId": _optional_str(payload, "eventId"),
        "reason": _optional_str(payload, "reason"),
    }


def _parse_payment_requested(payload: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "paymentId": _required_str(payload, "paymentId"),
        "registrationId": _required_str(payload, "registrationId"),
        "userId": _optional_str(payload, "userId"),
        "amountCents": _optional_money_cents(payload, "amount", default=0),
        "description": _optional_str(payload, "description"),
    }


def _parse_payment_approved(payload: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "paymentId": _required_str(payload, "paymentId"),
        "registrationId": _optional_str(payload, "registrationId"),
        "amountCents": _optional_money_cents(payload, "amount"),
    }


def _parse_payment_denied(payload: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "paymentId": _required_str(payload, "paymentId"),
        "registrationId": _optional_str(payload, "registrationId"),
        "reason": _optional_str(payload, "reason"),
    }


def _parse_user_checked_in(payload: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "activityId": _required_str(payload, "activityId"),
        "userId": _required_str(payload, "userId"),
        "eventId": _optional_str(payload, "eventId"),
        "checkedInAt": _required_datetime(payload, "checkedInAt"),
    }


def _parse_user_created(payload: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "userId": _required_str(payload, "userId"),
        "name": _optional_str(payload, "name"),
        "email": _optional_str(payload, "email"),
    }


def _parse_user_updated(payload: Mapping[str, Any]) -> dict[str, Any]:
    return _parse_user_created(payload)


_PARSERS = {
    "EventCreated": _parse_event_created,
    "EventUpdated": _parse_event_updated,
    "EventPublished": _parse_event_published,
    "EventCanceled": _parse_event_canceled,
    "EventDeleted": _parse_event_deleted,
    "ActivityCreated": _parse_activity_created,
    "ActivityUpdated": _parse_activity_updated,
    "ActivityDeleted": _parse_activity_deleted,
    "RegistrationCreated": _parse_registration_created,
    "RegistrationConfirmed": _parse_registration_confirmed,
    "RegistrationPromoted": _parse_registration_confirmed,
    "RegistrationCanceled": _parse_registration_canceled,
    "PaymentRequested": _parse_payment_requested,
    "PaymentApproved": _parse_payment_approved,
    "PaymentConfirmed": _parse_payment_approved,
    "PaymentDenied": _parse_payment_denied,
    "UserCheckedIn": _parse_user_checked_in,
    "AttendanceRegistered": _parse_user_checked_in,
    "UserRegistered": _parse_user_created,
    "EventOrganizersChanged": _parse_event_updated,
    "EventEnded": _parse_event_updated,
    "UserCreated": _parse_user_created,
    "UserUpdated": _parse_user_updated,
}


def parse_event(payload: Any) -> ParsedEvent:
    """Validate the common envelope and normalize a known domain event.

    Unknown event types are accepted (``data`` is empty) so the consumer can
    acknowledge them without blocking the queue.
    """

    if not isinstance(payload, Mapping):
        raise BadRequestError("event payload must be an object")

    event_type = payload.get("type")
    if not isinstance(event_type, str) or not event_type.strip():
        raise BadRequestError("type is required")
    event_type = event_type.strip()

    envelope_data = payload.get("data")
    if isinstance(envelope_data, Mapping):
        message_id = _optional_str(payload, "id")
        occurred_at = _optional_datetime(payload, "time")
        event_payload = envelope_data
    else:
        message_id = _optional_str(payload, "messageId")
        occurred_at = _optional_datetime(payload, "occurredAt")
        event_payload = payload
    parser = _PARSERS.get(event_type)
    data = parser(event_payload) if parser is not None else {}
    if event_type == "EventEnded":
        data["status"] = "ended"

    return ParsedEvent(
        type=event_type,
        message_id=message_id,
        occurred_at=occurred_at,
        data=data,
    )
