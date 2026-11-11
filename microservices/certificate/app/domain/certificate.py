from __future__ import annotations

import re
import secrets
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from types import MappingProxyType
from typing import Any, Iterable, Mapping
from uuid import uuid4

from .errors import BadRequestError

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_STRING_FIELDS = (
    "id",
    "user_id",
    "event_id",
    "participant_name",
    "event_name",
    "event_date",
    "verification_token",
    "created_at",
)


def _required(value: Any, field_name: str) -> str:
    if value is None or str(value).strip() == "":
        raise BadRequestError(f"{field_name} is required")
    return str(value)


def _normalize_activities(activities: Iterable[Any] | None) -> tuple[Mapping[str, str], ...]:
    if not activities:
        raise BadRequestError("activities must contain at least one item")

    normalized: list[Mapping[str, str]] = []
    for activity in activities:
        name = activity.get("name") if isinstance(activity, Mapping) else activity
        normalized.append(MappingProxyType({"name": _required(name, "activity.name")}))
    return tuple(normalized)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass(frozen=True, slots=True)
class Certificate:
    """Immutable snapshot of a participant certificate."""

    user_id: str
    event_id: str
    participant_name: str
    event_name: str
    event_date: str
    activities: tuple[Mapping[str, str], ...]
    id: str = field(default_factory=lambda: str(uuid4()))
    verification_token: str = field(default_factory=lambda: secrets.token_urlsafe(24))
    created_at: str = field(default_factory=_now_iso)

    def __post_init__(self) -> None:
        for name in _STRING_FIELDS:
            object.__setattr__(self, name, _required(getattr(self, name), name))

        if not _ISO_DATE.match(self.event_date):
            raise BadRequestError("event_date must be an ISO date (YYYY-MM-DD)")
        try:
            date.fromisoformat(self.event_date)
        except ValueError as exc:
            raise BadRequestError("event_date must be an ISO date (YYYY-MM-DD)") from exc

        object.__setattr__(self, "activities", _normalize_activities(self.activities))

    def to_metadata(self) -> dict:
        return {
            "id": self.id,
            "participantName": self.participant_name,
            "eventName": self.event_name,
            "eventDate": self.event_date,
            "activities": [dict(activity) for activity in self.activities],
            "verificationToken": self.verification_token,
            "issuedAt": self.created_at,
        }

    def to_public(self) -> dict:
        return {
            "valid": True,
            "participantName": self.participant_name,
            "eventName": self.event_name,
            "eventDate": self.event_date,
            "activities": [dict(activity) for activity in self.activities],
            "issuedAt": self.created_at,
        }

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "userId": self.user_id,
            "eventId": self.event_id,
            **self.to_metadata(),
        }
