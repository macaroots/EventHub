from __future__ import annotations

from app.application.projections import ProjectionService
from tests.support import (
    ADMIN_ID,
    EVENT_ID,
    ORG_ID,
    OTHER_ID,
    auth_headers,
    cookie_headers,
)


def test_health_is_public(api) -> None:
    client, _ = api

    response = client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "ok"
    assert body["consumer"]["queue"] == "reports"
    assert body["consumer"]["exchange"] == "event-hub"
    assert body["consumer"]["connected"] is False
    assert body["consumer"]["lastEventAt"]
    assert body["consumer"]["lastMessageType"] == "EventPublished"


def test_event_report_requires_authentication(api) -> None:
    client, _ = api

    missing = client.get(f"/reports/events/{EVENT_ID}")
    assert missing.status_code == 401
    assert missing.json() == {"error": "unauthorized"}

    invalid = client.get(
        f"/reports/events/{EVENT_ID}",
        headers={"Authorization": "Bearer not-a-jwt"},
    )
    assert invalid.status_code == 401
    assert invalid.json() == {"error": "invalid token"}


def test_event_report_rejects_non_organizer(api) -> None:
    client, _ = api

    response = client.get(
        f"/reports/events/{EVENT_ID}", headers=auth_headers(OTHER_ID)
    )

    assert response.status_code == 403
    assert response.json()["error"] == "user is not an organizer of this event"


def test_event_report_returns_consolidated_json(api) -> None:
    client, _ = api

    response = client.get(
        f"/reports/events/{EVENT_ID}",
        params={"include": "activities,payments,participants"},
        headers=auth_headers(),
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-report-updated-at"]
    body = response.json()
    assert body["totalRegistrations"] == 4
    assert body["totalRegistrationsConfirmed"] == 3
    assert body["totalAttendances"] == 3
    assert body["totals"]["capacity"] == 50
    assert body["totals"]["occupancyRate"] == 6.0
    assert len(body["activities"]) == 2
    assert len(body["participants"]) == 5
    assert body["payments"]["approvedAmount"] == 100.0


def test_absent_include_sections_are_omitted(api) -> None:
    client, _ = api
    headers = auth_headers()

    event = client.get(f"/reports/events/{EVENT_ID}", headers=headers).json()
    assert "activities" in event
    assert "participants" not in event
    assert "payments" not in event

    activity = client.get(
        "/reports/activities/event-1-act-1", headers=headers
    ).json()
    assert "participants" not in activity


def test_cookie_and_admin_authentication(api) -> None:
    client, _ = api

    cookie = client.get(
        f"/reports/events/{EVENT_ID}", headers=cookie_headers(ORG_ID)
    )
    assert cookie.status_code == 200

    role = client.get(
        f"/reports/events/{EVENT_ID}", headers=auth_headers("any", role="admin")
    )
    assert role.status_code == 200

    allowlisted = client.get(
        f"/reports/events/{EVENT_ID}", headers=auth_headers(ADMIN_ID)
    )
    assert allowlisted.status_code == 200


def test_missing_deleted_and_invalid_requests(api) -> None:
    client, repository = api

    missing = client.get(
        "/reports/events/missing", headers=auth_headers()
    )
    assert missing.status_code == 404

    ProjectionService(repository).apply(
        {"type": "EventDeleted", "eventId": EVENT_ID}
    )
    deleted = client.get(
        f"/reports/events/{EVENT_ID}", headers=auth_headers()
    )
    assert deleted.status_code == 404


def test_invalid_format_include_and_filters_return_400(api) -> None:
    client, _ = api
    headers = auth_headers()

    assert (
        client.get(
            f"/reports/events/{EVENT_ID}", params={"format": "docx"}, headers=headers
        ).status_code
        == 400
    )
    assert (
        client.get(
            f"/reports/events/{EVENT_ID}",
            params={"include": "payments,tickets"},
            headers=headers,
        ).status_code
        == 400
    )
    assert (
        client.get(
            f"/reports/events/{EVENT_ID}/participants",
            params={"status": "waiting"},
            headers=headers,
        ).status_code
        == 400
    )
    assert (
        client.get(
            f"/reports/events/{EVENT_ID}/participants",
            params={"checkedIn": "maybe"},
            headers=headers,
        ).status_code
        == 400
    )
    assert (
        client.get(
            f"/reports/events/{EVENT_ID}/participants",
            params={"page": 0},
            headers=headers,
        ).status_code
        == 400
    )
    assert (
        client.get(
            f"/reports/events/{EVENT_ID}/participants",
            params={"limit": 1001},
            headers=headers,
        ).status_code
        == 400
    )


def test_csv_export_has_headers_and_bom(api) -> None:
    client, _ = api

    response = client.get(
        f"/reports/events/{EVENT_ID}",
        params={"format": "csv", "include": "activities,payments"},
        headers=auth_headers(),
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-report-updated-at"]
    assert "attachment; filename=\"relatorio-evento-" in response.headers[
        "content-disposition"
    ]
    assert response.content.startswith(b"\xef\xbb\xbf")
    assert b"secao,id,nome,status" in response.content


def test_xlsx_and_pdf_exports(api) -> None:
    client, _ = api
    headers = auth_headers()

    xlsx = client.get(
        f"/reports/events/{EVENT_ID}", params={"format": "xlsx"}, headers=headers
    )
    assert xlsx.status_code == 200
    assert xlsx.content.startswith(b"PK")
    assert xlsx.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument"
    )
    assert xlsx.headers["content-disposition"].endswith('.xlsx"')

    pdf = client.get(
        f"/reports/events/{EVENT_ID}", params={"format": "pdf"}, headers=headers
    )
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.headers["content-disposition"].endswith('.pdf"')


def test_activity_report_and_participants(api) -> None:
    client, _ = api
    headers = auth_headers()

    report = client.get(
        "/reports/activities/event-1-act-1",
        params={"include": "participants"},
        headers=headers,
    )
    assert report.status_code == 200
    body = report.json()
    assert body["activity"]["id"] == "event-1-act-1"
    assert body["registrations"]["confirmed"] == 2
    assert len(body["participants"]) == 2

    csv = client.get(
        "/reports/activities/event-1-act-1",
        params={"format": "csv"},
        headers=headers,
    )
    assert csv.status_code == 200
    assert "attachment; filename=\"relatorio-atividade-" in csv.headers[
        "content-disposition"
    ]


def test_participants_filters_pagination_and_export(api) -> None:
    client, _ = api
    headers = auth_headers()

    confirmed = client.get(
        f"/reports/events/{EVENT_ID}/participants",
        params={"status": "confirmed"},
        headers=headers,
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["total"] == 3
    assert all(item["status"] == "confirmed" for item in confirmed.json()["items"])

    checked = client.get(
        f"/reports/events/{EVENT_ID}/participants",
        params={"checkedIn": "true"},
        headers=headers,
    )
    assert checked.json()["total"] == 3

    by_activity = client.get(
        f"/reports/events/{EVENT_ID}/participants",
        params={"activityId": "event-1-act-1"},
        headers=headers,
    )
    assert by_activity.json()["total"] == 2

    paginated = client.get(
        f"/reports/events/{EVENT_ID}/participants",
        params={"page": 2, "limit": 2},
        headers=headers,
    )
    assert paginated.json()["page"] == 2
    assert len(paginated.json()["items"]) == 2

    export = client.get(
        f"/reports/events/{EVENT_ID}/participants",
        params={"format": "xlsx", "activityId": "event-1-act-1"},
        headers=headers,
    )
    assert export.status_code == 200
    assert export.content.startswith(b"PK")
    assert "attachment; filename=\"relatorio-participantes-" in export.headers[
        "content-disposition"
    ]


def test_unknown_activity_returns_404(api) -> None:
    client, _ = api

    response = client.get(
        "/reports/activities/missing", headers=auth_headers()
    )

    assert response.status_code == 404
