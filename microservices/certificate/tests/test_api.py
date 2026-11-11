from __future__ import annotations

import asyncio

from tests.support import (
    RecordingPublisher,
    auth_headers,
    certificate_api,
    certificate_requested,
    cookie_headers,
)


def seed_certificate(client, **overrides):
    return asyncio.run(
        client.app.state.service.criar(certificate_requested(**overrides))
    )[0]


def test_certificate_is_created_from_event_and_served_by_http(api) -> None:
    client, publisher, _ = api

    not_ready = client.post("/events/event-1/certificates", headers=auth_headers())
    assert not_ready.status_code == 404
    assert not_ready.json() == {"error": "certificate not available"}
    assert publisher.events == []

    certificate = seed_certificate(client)
    assert len(publisher.events) == 1
    assert publisher.events[0]["type"] == "CertificateIssued"
    assert publisher.events[0]["certificateId"] == certificate.id

    ready = client.post("/events/event-1/certificates", headers=auth_headers())
    assert ready.status_code == 200
    assert ready.json() == {"certificateId": certificate.id}
    assert len(publisher.events) == 1

    # Reentrega do evento: não cria de novo nem republica.
    replayed = seed_certificate(client)
    assert replayed.id == certificate.id
    assert len(publisher.events) == 1

    listing = client.get("/certificates", headers=auth_headers())
    assert listing.status_code == 200
    assert listing.json() == [
        {
            "certificateId": certificate.id,
            "eventName": "Congresso X",
            "eventDate": "2026-11-07",
        }
    ]

    metadata = client.get(f"/certificates/{certificate.id}", headers=auth_headers())
    assert metadata.status_code == 200
    body = metadata.json()
    assert body["participantName"] == "Maria Silva"
    assert body["eventName"] == "Congresso X"
    assert body["activities"] == [{"name": "Minicurso A"}, {"name": "Palestra B"}]
    assert "userId" not in body
    assert "eventId" not in body

    validation = client.get(f"/certificates/validate/{body['verificationToken']}")
    assert validation.status_code == 200
    assert validation.headers["cache-control"] == "no-store"
    public = validation.json()
    assert public["valid"] is True
    assert public["participantName"] == "Maria Silva"
    assert "userId" not in public
    assert "eventId" not in public
    assert "verificationToken" not in public

    download = client.get(
        f"/certificates/{certificate.id}/download", headers=auth_headers()
    )
    assert download.status_code == 200
    assert download.headers["content-type"] == "application/pdf"
    assert download.headers["cache-control"] == "no-store"
    assert "certificado-congresso-x-maria-silva.pdf" in download.headers["content-disposition"]
    assert download.content.startswith(b"%PDF")


def test_authentication_and_ownership(api) -> None:
    client, _, _ = api

    unauthenticated = client.get("/certificates")
    assert unauthenticated.status_code == 401
    assert unauthenticated.json() == {"error": "unauthorized"}

    invalid_token = client.get(
        "/certificates",
        headers={"Authorization": "Bearer not-a-jwt"},
    )
    assert invalid_token.status_code == 401

    unauthenticated_post = client.post("/events/event-1/certificates")
    assert unauthenticated_post.status_code == 401

    certificate = seed_certificate(client)

    forbidden = client.get(
        f"/certificates/{certificate.id}",
        headers=auth_headers("user-2"),
    )
    assert forbidden.status_code == 403

    forbidden_download = client.get(
        f"/certificates/{certificate.id}/download",
        headers=auth_headers("user-2"),
    )
    assert forbidden_download.status_code == 403

    admin = client.get(
        f"/certificates/{certificate.id}",
        headers=auth_headers("user-2", role="admin"),
    )
    assert admin.status_code == 200

    missing = client.get("/certificates/does-not-exist", headers=auth_headers("user-1"))
    assert missing.status_code == 404

    unknown_token = client.get("/certificates/validate/unknown")
    assert unknown_token.status_code == 404


def test_accepts_token_cookie(api) -> None:
    client, _, _ = api

    certificate = seed_certificate(client)

    listing = client.get("/certificates", headers=cookie_headers())
    assert listing.status_code == 200
    assert listing.json()[0]["certificateId"] == certificate.id

    ready = client.post("/events/event-1/certificates", headers=cookie_headers())
    assert ready.status_code == 200


def test_event_is_private_to_the_participant(api) -> None:
    client, _, _ = api

    seed_certificate(client, participantId="user-1")

    other_user = client.post("/events/event-1/certificates", headers=auth_headers("user-2"))
    assert other_user.status_code == 404
    assert other_user.json() == {"error": "certificate not available"}

    assert client.get("/certificates", headers=auth_headers("user-2")).json() == []


def test_health(api) -> None:
    client, _, _ = api

    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}
