from __future__ import annotations

import asyncio

import pytest

from app.application.certificate_service import CertificateService
from app.domain.errors import BadRequestError
from app.infrastructure.database import CertificateRepository
from tests.support import RecordingPublisher, certificate_requested


def make_service() -> tuple[CertificateService, CertificateRepository, RecordingPublisher]:
    repository = CertificateRepository(":memory:")
    publisher = RecordingPublisher()
    return CertificateService(repository, event_publisher=publisher), repository, publisher


def criar(service: CertificateService, payload):
    return asyncio.run(service.criar(payload))


def test_criar_persists_the_event_snapshot() -> None:
    service, repository, publisher = make_service()

    certificate, created = criar(service, certificate_requested())

    assert created is True
    assert certificate.user_id == "user-1"
    assert certificate.event_id == "event-1"
    assert certificate.participant_name == "Maria Silva"
    assert certificate.event_name == "Congresso X"
    assert certificate.event_date == "2026-11-07"
    assert [dict(activity) for activity in certificate.activities] == [
        {"name": "Minicurso A"},
        {"name": "Palestra B"},
    ]

    stored = repository.get_by_user_and_event("user-1", "event-1")
    assert stored == certificate
    assert repository.get_by_token(certificate.verification_token) == certificate

    assert publisher.events == [
        {
            "type": "CertificateIssued",
            "certificateId": certificate.id,
            "participantId": "user-1",
            "eventId": "event-1",
            "verificationToken": certificate.verification_token,
            "issuedAt": certificate.created_at,
        }
    ]


def test_criar_is_idempotent_and_does_not_republish() -> None:
    service, repository, publisher = make_service()

    first, created = criar(service, certificate_requested())
    second, created_again = criar(
        service,
        certificate_requested(participantName="Outro Nome", activities=[{"name": "Outra"}]),
    )

    assert created is True
    assert created_again is False
    assert second.id == first.id
    assert second.participant_name == "Maria Silva"
    assert len(repository.list_by_user("user-1")) == 1
    assert len(publisher.events) == 1


def test_criar_creates_one_certificate_per_event() -> None:
    service, repository, publisher = make_service()

    first, created = criar(service, certificate_requested(eventId="event-1"))
    second, created_again = criar(
        service, certificate_requested(eventId="event-2", eventName="Congresso Y")
    )

    assert created is True
    assert created_again is True
    assert first.id != second.id
    assert len(repository.list_by_user("user-1")) == 2
    assert len(publisher.events) == 2


def test_criar_accepts_payload_without_type() -> None:
    service, _, _ = make_service()
    payload = certificate_requested()
    payload.pop("type")

    certificate, created = criar(service, payload)

    assert created is True
    assert certificate.event_id == "event-1"


@pytest.mark.parametrize(
    "payload",
    [
        pytest.param("not-an-object", id="not-an-object"),
        pytest.param(certificate_requested(type="CertificateIssued"), id="wrong-type"),
        pytest.param(certificate_requested(participantId=""), id="missing-participant-id"),
        pytest.param(certificate_requested(participantName=""), id="missing-participant-name"),
        pytest.param(certificate_requested(eventId=""), id="missing-event-id"),
        pytest.param(certificate_requested(eventName=""), id="missing-event-name"),
        pytest.param(certificate_requested(eventDate=""), id="missing-event-date"),
        pytest.param(certificate_requested(eventDate="2026-11-07T10:00:00Z"), id="datetime"),
        pytest.param(certificate_requested(eventDate="2026-13-01"), id="invalid-date"),
        pytest.param(certificate_requested(activities=[]), id="no-activities"),
        pytest.param(certificate_requested(activities=[{"name": ""}]), id="empty-activity-name"),
        pytest.param(certificate_requested(activities=[{}]), id="activity-without-name"),
    ],
)
def test_criar_rejects_invalid_payloads(payload) -> None:
    service, repository, publisher = make_service()

    with pytest.raises(BadRequestError):
        criar(service, payload)

    assert repository.list_by_user("user-1") == []
    assert publisher.events == []
