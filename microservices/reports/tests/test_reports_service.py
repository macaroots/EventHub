from __future__ import annotations

import pytest

from app.application.reports_service import ReportsService
from app.domain.errors import (
    BadRequestError,
    ForbiddenError,
    NotFoundError,
    PayloadTooLargeError,
)
from app.infrastructure.database import ReportsRepository
from tests.support import ADMIN_ID, EVENT_ID, ORG_ID, OTHER_ID, settings, user


def make_service(
    repository: ReportsRepository, **overrides
) -> ReportsService:
    return ReportsService(repository, settings(**overrides))


def test_event_report_consolidates_event_metrics(
    seeded: ReportsRepository,
) -> None:
    report = make_service(seeded).event_report(
        user(),
        EVENT_ID,
        include={"activities", "participants", "payments"},
    )

    assert report["event"]["id"] == EVENT_ID
    assert report["event"]["status"] == "published"
    assert report["totalRegistrations"] == 4
    assert report["totalRegistrationsConfirmed"] == 3
    assert report["totalAttendances"] == 3
    assert report["totals"] == {
        "registrations": {
            "all": 5,
            "active": 4,
            "pending": 1,
            "confirmed": 3,
            "canceled": 1,
        },
        "capacity": 50,
        "occupancyRate": 6.0,
        "attendanceRate": 66.67,
        "noShowRate": 33.33,
    }
    assert report["payments"] == {
        "requested": 1,
        "approved": 1,
        "denied": 0,
        "expectedAmount": 200.0,
        "approvedAmount": 100.0,
        "currency": "BRL",
    }
    assert len(report["activities"]) == 2
    assert len(report["participants"]) == 5
    assert report["dataUpdatedAt"]


def test_event_report_default_include_only_has_activities(
    seeded: ReportsRepository,
) -> None:
    service = make_service(seeded)
    include = service.parse_include(None)

    report = service.event_report(user(), EVENT_ID, include=include)

    assert "activities" in report
    assert "participants" not in report
    assert "payments" not in report


def test_activity_report_has_activity_metrics(
    seeded: ReportsRepository,
) -> None:
    report = make_service(seeded).activity_report(
        user(),
        "event-1-act-1",
        include={"participants"},
    )

    assert report["activity"]["id"] == "event-1-act-1"
    assert report["activity"]["eventId"] == EVENT_ID
    assert report["event"] == {"id": EVENT_ID, "name": "Congresso de Tecnologia 2026"}
    assert report["totalRegistrations"] == 2
    assert report["totalRegistrationsConfirmed"] == 2
    assert report["totalAttendances"] == 2
    assert report["registrations"] == {
        "all": 2,
        "active": 2,
        "pending": 0,
        "confirmed": 2,
        "canceled": 0,
    }
    assert report["occupancyRate"] == 6.67
    assert report["attendanceRate"] == 100.0
    assert report["noShowRate"] == 0.0
    assert len(report["participants"]) == 2


def test_authorization_requires_organizer_or_admin(
    seeded: ReportsRepository,
) -> None:
    service = make_service(seeded)

    with pytest.raises(ForbiddenError):
        service.event_report(user(OTHER_ID), EVENT_ID, include={"activities"})

    with pytest.raises(ForbiddenError):
        service.activity_report(
            user(OTHER_ID), "event-1-act-1", include={"participants"}
        )


def test_admin_role_and_allowlist_are_accepted(
    seeded: ReportsRepository,
) -> None:
    service = make_service(seeded, admin_user_ids=())
    assert service.event_report(user(role="admin"), EVENT_ID, include=set())

    allowlisted = make_service(seeded, admin_user_ids=(ADMIN_ID,))
    assert allowlisted.event_report(user(ADMIN_ID), EVENT_ID, include=set())


def test_unknown_event_or_activity_returns_not_found(
    seeded: ReportsRepository,
) -> None:
    service = make_service(seeded)

    with pytest.raises(NotFoundError):
        service.event_report(user(), "missing", include={"activities"})

    with pytest.raises(NotFoundError):
        service.activity_report(user(), "missing", include={"participants"})


def test_participants_page_applies_filters_and_pagination(
    seeded: ReportsRepository,
) -> None:
    service = make_service(seeded)

    confirmed, confirmed_updated_at = service.participants_page(
        user(),
        EVENT_ID,
        activity_id=None,
        statuses=["confirmed"],
        checked_in=None,
        page=1,
        limit=100,
    )
    assert confirmed["total"] == 3
    assert confirmed_updated_at
    assert {item["status"] for item in confirmed["items"]} == {"confirmed"}

    checked, checked_updated_at = service.participants_page(
        user(),
        EVENT_ID,
        activity_id=None,
        statuses=None,
        checked_in=True,
        page=1,
        limit=100,
    )
    assert checked["total"] == 3
    assert checked_updated_at
    assert all(item["checkedInAt"] for item in checked["items"])

    page, page_updated_at = service.participants_page(
        user(),
        EVENT_ID,
        activity_id=None,
        statuses=None,
        checked_in=None,
        page=2,
        limit=2,
    )
    assert page["total"] == 5
    assert page_updated_at
    assert len(page["items"]) == 2
    assert page["page"] == 2

    activity, activity_updated_at = service.participants_page(
        user(),
        EVENT_ID,
        activity_id="event-1-act-1",
        statuses=None,
        checked_in=None,
        page=1,
        limit=100,
    )
    assert activity["total"] == 2
    assert activity_updated_at
    assert all(
        item["activityId"] == "event-1-act-1" for item in activity["items"]
    )


def test_event_export_contains_the_same_snapshot(
    seeded: ReportsRepository,
) -> None:
    export = make_service(seeded).event_export(
        user(), EVENT_ID, include={"activities", "participants", "payments"}
    )

    assert export.kind == "event"
    assert export.title == "Congresso de Tecnologia 2026"
    assert export.summary["registrations"]["active"] == 4
    assert export.summary["capacity"] == 50
    assert len(export.activities) == 2
    assert len(export.participants) == 5
    assert len(export.payments) == 2
    assert export.include_participants is True
    assert export.include_payments is True


def test_activity_export_always_contains_participants(
    seeded: ReportsRepository,
) -> None:
    export = make_service(seeded).activity_export(
        user(), "event-1-act-1", include=set()
    )

    assert export.kind == "activity"
    assert export.include_participants is True
    assert len(export.participants) == 2
    assert export.summary["registrations"]["confirmed"] == 2


def test_participants_export_respects_filters(seeded: ReportsRepository) -> None:
    export = make_service(seeded).participants_export(
        user(),
        EVENT_ID,
        activity_id="event-1-act-2",
        statuses=["confirmed"],
        checked_in=None,
    )

    assert export.kind == "participants"
    assert export.summary["total"] == 1
    assert export.participants[0]["userId"] == "user-5"


def test_export_limit_returns_payload_too_large(seeded: ReportsRepository) -> None:
    service = make_service(seeded, max_export_rows=2)

    with pytest.raises(PayloadTooLargeError):
        service.event_export(user(), EVENT_ID, include={"participants"})

    with pytest.raises(PayloadTooLargeError):
        service.participants_export(
            user(),
            EVENT_ID,
            activity_id=None,
            statuses=None,
            checked_in=None,
        )


def test_invalid_filters_are_rejected(seeded: ReportsRepository) -> None:
    service = make_service(seeded)

    with pytest.raises(BadRequestError):
        service.parse_format("docx")

    with pytest.raises(BadRequestError):
        service.parse_include("payments,tickets")

    with pytest.raises(BadRequestError):
        service.parse_statuses("waiting")

    with pytest.raises(BadRequestError):
        service.parse_checked_in("maybe")

    with pytest.raises(BadRequestError):
        service.parse_page(0)

    with pytest.raises(BadRequestError):
        service.parse_limit(1001)


def test_activity_filter_must_belong_to_event(seeded: ReportsRepository) -> None:
    from app.application.projections import ProjectionService

    ProjectionService(seeded).apply(
        {
            "type": "EventCreated",
            "eventId": "event-2",
            "name": "Outro evento",
            "organizers": [ORG_ID],
        }
    )
    ProjectionService(seeded).apply(
        {
            "type": "ActivityCreated",
            "activityId": "other-act",
            "eventId": "event-2",
            "name": "Outra atividade",
        }
    )

    service = make_service(seeded)
    with pytest.raises(BadRequestError):
        service.participants_page(
            user(),
            EVENT_ID,
            activity_id="other-act",
            statuses=None,
            checked_in=None,
            page=1,
            limit=100,
        )
