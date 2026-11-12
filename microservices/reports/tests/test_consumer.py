from __future__ import annotations

import asyncio
import json

from app.application.projections import ProjectionService
from app.infrastructure.consumer import ReportsConsumer
from app.infrastructure.database import ReportsRepository


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


class FailingProjection:
    def apply(self, event):
        raise RuntimeError("database is locked")


def event_created(**overrides) -> dict:
    payload = {
        "type": "EventCreated",
        "eventId": "event-1",
        "name": "Congresso",
        "organizers": ["org-1"],
    }
    payload.update(overrides)
    return payload


def test_valid_event_is_projected_and_acknowledged() -> None:
    repository = ReportsRepository(":memory:")
    consumer = ReportsConsumer(None, ProjectionService(repository))
    message = FakeMessage(event_created())

    try:
        asyncio.run(consumer._handle(message))
        assert message.acks == 1
        assert message.nacks == []
        assert repository.get_event("event-1") is not None
    finally:
        repository.close()


def test_malformed_json_is_discarded() -> None:
    consumer = ReportsConsumer(None, FailingProjection())
    message = FakeMessage(b"{not-json")

    asyncio.run(consumer._handle(message))

    assert message.acks == 0
    assert message.nacks == [False]


def test_invalid_payload_is_discarded_without_requeue() -> None:
    repository = ReportsRepository(":memory:")
    consumer = ReportsConsumer(None, ProjectionService(repository))
    message = FakeMessage({"eventId": "event-1"})

    try:
        asyncio.run(consumer._handle(message))
        assert message.acks == 0
        assert message.nacks == [False]
    finally:
        repository.close()


def test_unknown_event_type_is_acknowledged() -> None:
    repository = ReportsRepository(":memory:")
    consumer = ReportsConsumer(None, ProjectionService(repository))
    message = FakeMessage({"type": "SomethingNew"})

    try:
        asyncio.run(consumer._handle(message))
        assert message.acks == 1
        assert message.nacks == []
    finally:
        repository.close()


def test_transient_failure_is_requeued() -> None:
    consumer = ReportsConsumer(None, FailingProjection())
    message = FakeMessage(event_created())

    asyncio.run(consumer._handle(message))

    assert message.acks == 0
    assert message.nacks == [True]


def test_start_without_url_is_a_noop() -> None:
    consumer = ReportsConsumer(None, FailingProjection())

    asyncio.run(consumer.start())
    assert consumer.connected is False

    asyncio.run(consumer.close())
