from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class ApplyResult:
    """Outcome of applying one event to the read model."""

    applied: bool
    ignored: bool = False
    unknown: bool = False
    event_type: str | None = None


@dataclass(frozen=True, slots=True)
class Event:
    id: str
    name: str
    information: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    status: str = "draft"
    cancel_reason: str | None = None
    organizers: tuple[str, ...] = ()
    source_at: str | None = None
    updated_at: str = ""
    deleted_at: str | None = None

    @property
    def deleted(self) -> bool:
        return self.deleted_at is not None

    def is_organizer(self, user_id: str) -> bool:
        return user_id in self.organizers


@dataclass(frozen=True, slots=True)
class Activity:
    id: str
    event_id: str
    name: str
    description: str | None = None
    location: str | None = None
    starts_at: str | None = None
    ends_at: str | None = None
    capacity: int = 0
    price_cents: int = 0
    rules: tuple[Any, ...] = ()
    source_at: str | None = None
    updated_at: str = ""
    deleted_at: str | None = None

    @property
    def deleted(self) -> bool:
        return self.deleted_at is not None

    @property
    def price(self) -> float:
        return round(self.price_cents / 100.0, 2)

    @property
    def rules_list(self) -> list[Any]:
        return list(self.rules)


@dataclass(frozen=True, slots=True)
class Registration:
    id: str
    activity_id: str
    user_id: str
    status: str = "pending"
    event_id: str | None = None
    requirements: tuple[Any, ...] = ()
    reasons: tuple[Any, ...] = ()
    source_at: str | None = None
    updated_at: str = ""


@dataclass(frozen=True, slots=True)
class Attendance:
    activity_id: str
    user_id: str
    checked_in_at: str
    event_id: str | None = None
    source_at: str | None = None


@dataclass(frozen=True, slots=True)
class Payment:
    id: str
    registration_id: str | None = None
    user_id: str | None = None
    amount_cents: int = 0
    status: str = "requested"
    description: str | None = None
    reason: str | None = None
    source_at: str | None = None
    updated_at: str = ""

    @property
    def amount(self) -> float:
        return round(self.amount_cents / 100.0, 2)


@dataclass(frozen=True, slots=True)
class Participant:
    id: str
    name: str | None = None
    email: str | None = None


@dataclass(frozen=True, slots=True)
class ExportReport:
    """Flattened view consumed by the CSV/XLSX/PDF exporters.

    The same object feeds every format so the files always reflect the same
    snapshot of the read model.
    """

    kind: str
    title: str
    slug: str
    generated_at: str
    data_updated_at: str | None
    event: dict[str, Any]
    summary: dict[str, Any]
    activities: tuple[dict[str, Any], ...] = ()
    participants: tuple[dict[str, Any], ...] = ()
    payments: tuple[dict[str, Any], ...] = ()
    include_participants: bool = False
    include_payments: bool = False
