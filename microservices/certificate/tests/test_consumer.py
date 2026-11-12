from __future__ import annotations

import asyncio
import json

from app.application.certificate_service import CertificateService
from app.infrastructure.consumer import CertificateRequestedConsumer
from app.infrastructure.database import CertificateRepository
from tests.support import RecordingPublisher, certificate_requested, envelope


class FakeMessage:
    def __init__(self, payload) -> None:
        if isinstance(payload, bytes):
            self.body = payload
        else:
            self.body = json.dumps(payload).encode("utf-8")
        self.acks = 0
        self.nacks: list[bool] = []

    async def ack(self) -> None:
        self.acks += 1

    async def nack(self, requeue: bool = True) -> None:
        self.nacks.append(requeue)


class FailingService:
    async def criar(self, event):
        raise RuntimeError("database is locked")


def make_consumer() -> tuple[CertificateRequestedConsumer, CertificateRepository, RecordingPublisher]:
    repository = CertificateRepository(":memory:")
    publisher = RecordingPublisher()
    service = CertificateService(repository, event_publisher=publisher)
    return CertificateRequestedConsumer(None, service), repository, publisher


def handle(consumer: CertificateRequestedConsumer, payload) -> FakeMessage:
    message = FakeMessage(payload)
    asyncio.run(consumer._handle(message))
    return message


def test_valid_event_is_acked_and_creates_certificate() -> None:
    consumer, repository, publisher = make_consumer()

    message = handle(consumer, certificate_requested())

    assert message.acks == 1
    assert message.nacks == []
    assert len(repository.list_by_user("user-1")) == 1
    assert len(publisher.events) == 1


def test_registration_outbox_envelope_creates_downloadable_certificate() -> None:
    from app.infrastructure.pdf_generator import PdfGenerator

    consumer, repository, _ = make_consumer()
    event = {
        "id": "outbox-1", "type": "CertificateRequested", "source": "registration",
        "time": "2026-11-13T01:09:44.239Z",
        "data": {
            "requestId": "event-1:user-1", "eventId": "event-1", "userId": "user-1",
            "participantName": "Maria Silva", "eventName": "Congresso",
            "activities": [
                {"activityId": "a1", "name": "Workshop", "workload": 2, "date": "2026-11-12"},
                {"activityId": "a2", "name": "Palestra", "workload": 1, "date": "2026-11-11"},
            ], "totalWorkload": 3,
        },
    }
    message = handle(consumer, event)
    assert message.acks == 1 and message.nacks == []
    certificate = repository.get_by_user_and_event("user-1", "event-1")
    assert certificate is not None
    assert certificate.event_date == "2026-11-11"
    assert certificate.participant_name == "Maria Silva"
    assert PdfGenerator("http://localhost:3005").generate(certificate).startswith(b"%PDF")
    handle(consumer, event)
    assert len(repository.list_by_user("user-1")) == 1


def test_invalid_registration_envelope_is_discarded() -> None:
    consumer, repository, _ = make_consumer()
    message = handle(consumer, {"type": "CertificateRequested", "data": {"userId": "user-1", "activities": [{"name": "Workshop", "date": "invalid"}]}})
    assert message.acks == 0 and message.nacks == [False]
    assert repository.list_by_user("user-1") == []


def test_envelope_is_unwrapped() -> None:
    consumer, repository, publisher = make_consumer()

    message = handle(consumer, envelope(certificate_requested()))

    assert message.acks == 1
    assert message.nacks == []
    assert len(repository.list_by_user("user-1")) == 1
    assert len(publisher.events) == 1


def test_envelope_with_another_type_is_discarded() -> None:
    consumer, repository, _ = make_consumer()

    message = handle(consumer, envelope(certificate_requested(), "CertificateIssued"))

    assert message.nacks == [False]
    assert repository.list_by_user("user-1") == []


def test_redelivery_is_acked_without_duplicating() -> None:
    consumer, repository, publisher = make_consumer()

    first = handle(consumer, certificate_requested())
    second = handle(consumer, certificate_requested())

    assert first.acks == 1 and second.acks == 1
    assert len(repository.list_by_user("user-1")) == 1
    assert len(publisher.events) == 1


def test_malformed_json_is_discarded() -> None:
    consumer, repository, _ = make_consumer()

    message = handle(consumer, b"{not json")

    assert message.acks == 0
    assert message.nacks == [False]
    assert repository.list_by_user("user-1") == []


def test_invalid_payload_is_discarded() -> None:
    consumer, repository, publisher = make_consumer()

    message = handle(consumer, certificate_requested(eventDate="2026-11-07T10:00:00Z"))

    assert message.acks == 0
    assert message.nacks == [False]
    assert repository.list_by_user("user-1") == []
    assert publisher.events == []


def test_unexpected_error_requeues_the_message() -> None:
    consumer = CertificateRequestedConsumer(None, FailingService())  # type: ignore[arg-type]

    message = handle(consumer, certificate_requested())

    assert message.acks == 0
    assert message.nacks == [True]


def test_start_without_rabbitmq_url_is_a_noop() -> None:
    consumer, _, _ = make_consumer()

    asyncio.run(consumer.start())
    assert consumer.connected is False
    asyncio.run(consumer.close())
    assert consumer.connected is False
