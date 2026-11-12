from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from typing import Any, Iterable, Sequence

from ..config import Settings
from ..domain.errors import (
    BadRequestError,
    ForbiddenError,
    NotFoundError,
    PayloadTooLargeError,
)
from ..domain.metrics import (
    event_attendance_rate,
    no_show,
    payment_summary,
    percent,
    registration_counts,
)
from ..domain.models import (
    Activity,
    Attendance,
    Event,
    ExportReport,
    Payment,
    Registration,
)
from ..domain.text import slugify
from ..infrastructure.database import ReportsRepository
from .events import REGISTRATION_STATUSES

FORMATS: tuple[str, ...] = ("json", "csv", "xlsx", "pdf")
INCLUDES: tuple[str, ...] = ("activities", "participants", "payments")

DEFAULT_PAGE = 100
MAX_PAGE = 1000


def now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def _latest(values: Iterable[str | None]) -> str | None:
    candidates = [value for value in values if value]
    return max(candidates) if candidates else None


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


class ReportsService:
    """Authorization, report assembly and export snapshots."""

    def __init__(self, repository: ReportsRepository, settings: Settings) -> None:
        self.repository = repository
        self.settings = settings

    # ------------------------------------------------------------------ #
    # Input validation
    # ------------------------------------------------------------------ #

    def parse_format(self, value: str | None) -> str:
        if value is None or value.strip() == "":
            return "json"
        normalized = value.strip().lower()
        if normalized not in FORMATS:
            raise BadRequestError(
                f"format must be one of: {', '.join(FORMATS)}"
            )
        return normalized

    def parse_include(self, value: str | None) -> set[str]:
        if value is None or value.strip() == "":
            return {"activities"}
        items = {item.lower() for item in _split_csv(value)}
        invalid = sorted(items - set(INCLUDES))
        if invalid:
            raise BadRequestError(
                f"include must be a subset of: {', '.join(INCLUDES)}",
                [f"unknown include value: {item}" for item in invalid],
            )
        return items or {"activities"}

    def parse_page(self, value: int | None) -> int:
        if value is None:
            return 1
        if value < 1:
            raise BadRequestError("page must be >= 1")
        return value

    def parse_limit(self, value: int | None) -> int:
        if value is None:
            return DEFAULT_PAGE
        if value < 1 or value > MAX_PAGE:
            raise BadRequestError(f"limit must be between 1 and {MAX_PAGE}")
        return value

    def parse_checked_in(self, value: str | None) -> bool | None:
        if value is None or value.strip() == "":
            return None
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False
        raise BadRequestError("checkedIn must be true or false")

    def parse_statuses(self, value: str | None) -> list[str] | None:
        items = [item.lower() for item in _split_csv(value)]
        if not items:
            return None
        invalid = sorted(set(items) - REGISTRATION_STATUSES)
        if invalid:
            raise BadRequestError(
                "status must be a subset of: canceled, confirmed, pending",
                [f"unknown status: {item}" for item in invalid],
            )
        return items

    # ------------------------------------------------------------------ #
    # Authorization
    # ------------------------------------------------------------------ #

    def is_admin(self, user: Any) -> bool:
        if getattr(user, "role", None) == "admin":
            return True
        return str(user.id) in self.settings.admin_user_ids

    def require_event(self, event_id: str) -> Event:
        event = self.repository.get_event(event_id)
        if event is None or event.deleted:
            raise NotFoundError("event not found")
        return event

    def require_activity(self, activity_id: str) -> tuple[Activity, Event]:
        activity = self.repository.get_activity(activity_id)
        if activity is None or activity.deleted:
            raise NotFoundError("activity not found")
        event = self.repository.get_event(activity.event_id)
        if event is None or event.deleted:
            raise NotFoundError("event not found")
        return activity, event

    def authorize_event(self, user: Any, event: Event) -> None:
        if self.is_admin(user):
            return
        if event.is_organizer(str(user.id)):
            return
        raise ForbiddenError("user is not an organizer of this event")

    def _authorize(self, user: Any, event_id: str) -> Event:
        event = self.require_event(event_id)
        self.authorize_event(user, event)
        return event

    def _validate_activity_filter(self, event_id: str, activity_id: str | None) -> None:
        if not activity_id:
            return
        activity = self.repository.get_activity(activity_id)
        if activity is None or activity.deleted:
            raise NotFoundError("activity not found")
        if activity.event_id != event_id:
            raise BadRequestError("activityId does not belong to the event")

    # ------------------------------------------------------------------ #
    # Report assembly
    # ------------------------------------------------------------------ #

    def event_report(
        self,
        user: Any,
        event_id: str,
        *,
        include: set[str],
    ) -> dict[str, Any]:
        event = self._authorize(user, event_id)
        activities = self.repository.list_activities(event.id)
        registrations = self.repository.list_registrations(event_id=event.id)
        attendances = self.repository.list_attendances(event_id=event.id)
        payments = self.repository.list_payments(event_id=event.id)

        registrations_by_activity = _group_by_activity(registrations)
        attendances_by_activity = _group_by_activity(attendances)
        capacity = sum(activity.capacity for activity in activities)
        counts = registration_counts(registrations)
        attendance_rate = event_attendance_rate(registrations, attendances)

        report: dict[str, Any] = {
            "event": _event_dict(event),
            "generatedAt": now_iso(),
            "dataUpdatedAt": _data_updated_at(
                event, activities, registrations, attendances, payments
            ),
            "totalRegistrations": counts["active"],
            "totalRegistrationsConfirmed": counts["confirmed"],
            "totalAttendances": len(
                {(item.activity_id, item.user_id) for item in attendances}
            ),
            "totals": {
                "registrations": counts,
                "capacity": capacity,
                "occupancyRate": percent(counts["confirmed"], capacity),
                "attendanceRate": attendance_rate,
                "noShowRate": no_show(attendance_rate),
            },
        }

        if "activities" in include:
            report["activities"] = [
                self._activity_metrics(
                    activity,
                    registrations_by_activity.get(activity.id, []),
                    attendances_by_activity.get(activity.id, []),
                )
                for activity in activities
            ]

        if "payments" in include:
            report["payments"] = payment_summary(payments, self.settings.currency)

        if "participants" in include:
            report["participants"] = self._participants(
                event.id,
                activity_id=None,
                statuses=None,
                checked_in=None,
            )

        return report

    def activity_report(
        self,
        user: Any,
        activity_id: str,
        *,
        include: set[str],
    ) -> dict[str, Any]:
        activity, event = self.require_activity(activity_id)
        self.authorize_event(user, event)

        registrations = self.repository.list_registrations(activity_id=activity.id)
        attendances = self.repository.list_attendances(activity_id=activity.id)
        payments = self.repository.list_payments(activity_id=activity.id)
        counts = registration_counts(registrations)
        attendance_rate = percent(len(attendances), counts["confirmed"])

        report: dict[str, Any] = {
            "activity": _activity_dict(activity),
            "event": {"id": event.id, "name": event.name},
            "generatedAt": now_iso(),
            "dataUpdatedAt": _data_updated_at(
                event, [activity], registrations, attendances, payments
            ),
            "totalRegistrations": counts["active"],
            "totalRegistrationsConfirmed": counts["confirmed"],
            "totalAttendances": len(
                {(item.activity_id, item.user_id) for item in attendances}
            ),
            "registrations": counts,
            "occupancyRate": percent(counts["confirmed"], activity.capacity),
            "attendanceRate": attendance_rate,
            "noShowRate": no_show(attendance_rate),
        }

        if "participants" in include:
            report["participants"] = self._participants(
                event.id,
                activity_id=activity.id,
                statuses=None,
                checked_in=None,
            )

        return report

    def participants_page(
        self,
        user: Any,
        event_id: str,
        *,
        activity_id: str | None,
        statuses: list[str] | None,
        checked_in: bool | None,
        page: int,
        limit: int,
    ) -> tuple[dict[str, Any], str | None]:
        event = self._authorize(user, event_id)
        self._validate_activity_filter(event.id, activity_id)

        items, total = self.repository.list_participants(
            event.id,
            activity_id=activity_id,
            statuses=statuses,
            checked_in=checked_in,
            page=page,
            limit=limit,
        )

        updated_at = self.repository.last_event_at() or event.updated_at
        payload = {
            "items": items,
            "page": page,
            "limit": limit,
            "total": total,
            "dataUpdatedAt": updated_at,
        }
        return payload, updated_at

    # ------------------------------------------------------------------ #
    # Export snapshots
    # ------------------------------------------------------------------ #

    def event_export(
        self,
        user: Any,
        event_id: str,
        *,
        include: set[str],
    ) -> ExportReport:
        event = self._authorize(user, event_id)
        activities = self.repository.list_activities(event.id)
        registrations = self.repository.list_registrations(event_id=event.id)
        attendances = self.repository.list_attendances(event_id=event.id)
        payments = self.repository.list_payments(event_id=event.id)

        self._ensure_export_limit(len(activities))
        if "payments" in include:
            self._ensure_export_limit(len(payments))

        registrations_by_activity = _group_by_activity(registrations)
        attendances_by_activity = _group_by_activity(attendances)
        activity_rows = [
            self._activity_metrics(
                activity,
                registrations_by_activity.get(activity.id, []),
                attendances_by_activity.get(activity.id, []),
            )
            for activity in activities
        ]

        participant_rows: tuple[dict[str, Any], ...] = ()
        if "participants" in include:
            participant_rows = tuple(
                self._participants(
                    event.id,
                    activity_id=None,
                    statuses=None,
                    checked_in=None,
                )
            )

        total = len(registrations)
        counts = registration_counts(registrations)
        attendance_rate = event_attendance_rate(registrations, attendances)
        capacity = sum(activity.capacity for activity in activities)
        summary = {
            "registrations": counts,
            "capacity": capacity,
            "occupancyRate": percent(counts["confirmed"], capacity),
            "attendanceRate": attendance_rate,
            "noShowRate": no_show(attendance_rate),
            "totalAttendances": len(
                {(item.activity_id, item.user_id) for item in attendances}
            ),
            "total": total,
            "payments": payment_summary(payments, self.settings.currency),
        }

        return ExportReport(
            kind="event",
            title=event.name,
            slug=slugify(event.name, fallback=event.id),
            generated_at=now_iso(),
            data_updated_at=_data_updated_at(
                event, activities, registrations, attendances, payments
            ),
            event=_event_dict(event),
            summary=summary,
            activities=tuple(activity_rows),
            participants=participant_rows,
            payments=(
                tuple(_payment_row(payment, self.settings.currency) for payment in payments)
                if "payments" in include
                else ()
            ),
            include_participants="participants" in include,
            include_payments="payments" in include,
        )

    def activity_export(
        self,
        user: Any,
        activity_id: str,
        *,
        include: set[str],
    ) -> ExportReport:
        activity, event = self.require_activity(activity_id)
        self.authorize_event(user, event)

        registrations = self.repository.list_registrations(activity_id=activity.id)
        attendances = self.repository.list_attendances(activity_id=activity.id)
        payments = self.repository.list_payments(activity_id=activity.id)
        counts = registration_counts(registrations)
        attendance_rate = percent(len(attendances), counts["confirmed"])

        if "payments" in include:
            self._ensure_export_limit(len(payments))

        participants = self._participants(
            event.id,
            activity_id=activity.id,
            statuses=None,
            checked_in=None,
        )

        return ExportReport(
            kind="activity",
            title=activity.name,
            slug=slugify(activity.name, fallback=activity.id),
            generated_at=now_iso(),
            data_updated_at=_data_updated_at(
                event, [activity], registrations, attendances, payments
            ),
            event=_event_dict(event),
            summary={
                "registrations": counts,
                "capacity": activity.capacity,
                "occupancyRate": percent(counts["confirmed"], activity.capacity),
                "attendanceRate": attendance_rate,
                "noShowRate": no_show(attendance_rate),
                "totalAttendances": len(
                    {(item.activity_id, item.user_id) for item in attendances}
                ),
                "total": len(registrations),
                "payments": payment_summary(payments, self.settings.currency),
            },
            activities=(),
            participants=tuple(participants),
            payments=(
                tuple(_payment_row(payment, self.settings.currency) for payment in payments)
                if "payments" in include
                else ()
            ),
            include_participants=True,
            include_payments="payments" in include,
        )

    def participants_export(
        self,
        user: Any,
        event_id: str,
        *,
        activity_id: str | None,
        statuses: list[str] | None,
        checked_in: bool | None,
    ) -> ExportReport:
        event = self._authorize(user, event_id)
        self._validate_activity_filter(event.id, activity_id)

        items, total = self.repository.list_participants(
            event.id,
            activity_id=activity_id,
            statuses=statuses,
            checked_in=checked_in,
            page=1,
            limit=self.settings.max_export_rows + 1,
        )
        self._ensure_export_limit(total)

        by_status = Counter(str(item.get("status") or "pending") for item in items)
        checked_in_count = sum(1 for item in items if item.get("checkedInAt"))

        return ExportReport(
            kind="participants",
            title=f"{event.name} - participantes",
            slug=slugify(event.name, fallback=event.id),
            generated_at=now_iso(),
            data_updated_at=self.repository.last_event_at() or event.updated_at,
            event=_event_dict(event),
            summary={
                "registrations": {
                    "all": total,
                    "active": by_status.get("pending", 0)
                    + by_status.get("confirmed", 0),
                    "pending": by_status.get("pending", 0),
                    "confirmed": by_status.get("confirmed", 0),
                    "canceled": by_status.get("canceled", 0),
                },
                "capacity": 0,
                "occupancyRate": None,
                "attendanceRate": None,
                "noShowRate": None,
                "totalAttendances": checked_in_count,
                "total": total,
                "payments": None,
            },
            participants=tuple(items),
            include_participants=True,
        )

    # ------------------------------------------------------------------ #
    # Internals
    # ------------------------------------------------------------------ #

    def _participants(
        self,
        event_id: str,
        *,
        activity_id: str | None,
        statuses: list[str] | None,
        checked_in: bool | None,
    ) -> list[dict[str, Any]]:
        items, total = self.repository.list_participants(
            event_id,
            activity_id=activity_id,
            statuses=statuses,
            checked_in=checked_in,
            page=1,
            limit=self.settings.max_export_rows + 1,
        )
        self._ensure_export_limit(total)
        return items

    def _ensure_export_limit(self, total: int) -> None:
        if total > self.settings.max_export_rows:
            raise PayloadTooLargeError(
                "report too large",
                [
                    f"{total} rows exceed the limit of "
                    f"{self.settings.max_export_rows}"
                ],
            )

    def _activity_metrics(
        self,
        activity: Activity,
        registrations: Sequence[Registration],
        attendances: Sequence[Attendance],
    ) -> dict[str, Any]:
        counts = registration_counts(registrations)
        attendance_rate = percent(len(attendances), counts["confirmed"])
        return {
            "id": activity.id,
            "name": activity.name,
            "location": activity.location,
            "startsAt": activity.starts_at,
            "endsAt": activity.ends_at,
            "capacity": activity.capacity,
            "price": activity.price,
            "totalRegistrations": counts["active"],
            "totalRegistrationsConfirmed": counts["confirmed"],
            "totalAttendances": len(
                {(item.activity_id, item.user_id) for item in attendances}
            ),
            "registrations": counts,
            "occupancyRate": percent(counts["confirmed"], activity.capacity),
            "attendanceRate": attendance_rate,
            "noShowRate": no_show(attendance_rate),
        }


def _group_by_activity(
    items: Sequence[Registration] | Sequence[Attendance],
) -> dict[str, list[Any]]:
    grouped: dict[str, list[Any]] = {}
    for item in items:
        grouped.setdefault(item.activity_id, []).append(item)
    return grouped


def _event_dict(event: Event) -> dict[str, Any]:
    return {
        "id": event.id,
        "name": event.name,
        "startDate": event.start_date,
        "endDate": event.end_date,
        "status": event.status,
        "cancelReason": event.cancel_reason,
    }


def _activity_dict(activity: Activity) -> dict[str, Any]:
    return {
        "id": activity.id,
        "eventId": activity.event_id,
        "name": activity.name,
        "description": activity.description,
        "location": activity.location,
        "startsAt": activity.starts_at,
        "endsAt": activity.ends_at,
        "capacity": activity.capacity,
        "price": activity.price,
        "rules": activity.rules_list,
    }


def _payment_row(payment: Payment, currency: str) -> dict[str, Any]:
    return {
        "id": payment.id,
        "registrationId": payment.registration_id,
        "description": payment.description,
        "status": payment.status,
        "amount": payment.amount,
        "currency": currency,
    }


def _data_updated_at(
    event: Event,
    activities: Sequence[Activity],
    registrations: Sequence[Registration],
    attendances: Sequence[Attendance],
    payments: Sequence[Payment],
) -> str | None:
    return _latest(
        [event.updated_at]
        + [activity.updated_at for activity in activities]
        + [registration.updated_at for registration in registrations]
        + [attendance.source_at for attendance in attendances]
        + [payment.updated_at for payment in payments]
    )
