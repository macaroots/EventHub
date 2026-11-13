from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from typing import Any, Mapping

from ..domain.errors import BadRequestError

EVENT_TYPE = "CertificateRequested"
_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


@dataclass(frozen=True, slots=True)
class CertificateRequested:
    """Snapshot published by ``registration`` when a participant is eligible.

    The payload is the published language between the services: ``certificate``
    never calls ``registration`` to validate eligibility, it trusts this event.
    """

    participant_id: str
    participant_name: str
    event_id: str
    event_name: str
    event_date: str
    activities: tuple[Mapping[str, str], ...]


def _required(payload: Mapping[str, Any], field: str) -> str:
    value = payload.get(field)
    if value is None or str(value).strip() == "":
        raise BadRequestError(f"{field} is required")
    return str(value).strip()


def _parse_event_date(value: str) -> str:
    if not _ISO_DATE.match(value):
        raise BadRequestError("eventDate must be an ISO date (YYYY-MM-DD)")
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise BadRequestError("eventDate must be an ISO date (YYYY-MM-DD)") from exc
    return value


def _parse_activities(value: Any) -> tuple[Mapping[str, str], ...]:
    if not isinstance(value, (list, tuple)) or not value:
        raise BadRequestError("activities must contain at least one item")

    activities: list[Mapping[str, str]] = []
    for item in value:
        name = item.get("name") if isinstance(item, Mapping) else item
        if name is None or str(name).strip() == "":
            raise BadRequestError("activity.name is required")
        activities.append({"name": str(name).strip()})
    return tuple(activities)


def parse_certificate_requested(event: Any) -> CertificateRequested:
    """Validate and normalize a ``CertificateRequested`` payload."""

    if not isinstance(event, Mapping):
        raise BadRequestError("event payload must be an object")

    event_type = event.get("type")
    if event_type is not None and event_type != EVENT_TYPE:
        raise BadRequestError(f"unexpected event type: {event_type}")

    # Contrato atual do outbox: {id, type, source, time, data}.
    # Continua aceitando o payload plano usado pelo publisher de desenvolvimento.
    if "data" in event:
        data = event["data"]
        if not isinstance(data, Mapping):
            raise BadRequestError("event.data must be an object")
        participant_id = _required(data, "userId")
        activities = data.get("activities")
        parsed_activities = _parse_activities(activities)
        dates = [
            _parse_event_date(_required(item, "date"))
            for item in activities
            if isinstance(item, Mapping)
        ]
        if not dates:
            raise BadRequestError("activity.date is required")
        return CertificateRequested(
            participant_id=participant_id,
            participant_name=str(data.get("participantName") or participant_id).strip(),
            event_id=_required(data, "eventId"),
            event_name=_required(data, "eventName"),
            event_date=min(dates),
            activities=parsed_activities,
        )

    return CertificateRequested(
        participant_id=_required(event, "participantId"),
        participant_name=_required(event, "participantName"),
        event_id=_required(event, "eventId"),
        event_name=_required(event, "eventName"),
        event_date=_parse_event_date(_required(event, "eventDate")),
        activities=_parse_activities(event.get("activities")),
    )
