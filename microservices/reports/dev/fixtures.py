from __future__ import annotations

from datetime import datetime, timedelta, timezone


def _stamp(index: int) -> str:
    base = datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)
    return (base + timedelta(minutes=index)).isoformat(
        timespec="milliseconds"
    ).replace("+00:00", "Z")


def build_events(event_id: str, organizer: str) -> list[dict]:
    """Deterministic event sequence used by the dev seed and publisher.

    The payloads follow ``docs/endpoint.md`` and the reports plan (§4.1).
    """

    act_1 = f"{event_id}-act-1"
    act_2 = f"{event_id}-act-2"
    reg = {index: f"{event_id}-reg-{index}" for index in range(1, 6)}
    pay_1 = f"{event_id}-pay-1"
    pay_2 = f"{event_id}-pay-2"

    events: list[dict] = [
        {
            "type": "EventCreated",
            "eventId": event_id,
            "name": "Congresso de Tecnologia 2026",
            "information": "Evento de demonstração do microserviço de relatórios.",
            "startDate": "2026-11-07",
            "endDate": "2026-11-09",
            "status": "draft",
            "organizers": [organizer],
        },
        {
            "type": "UserCreated",
            "userId": "user-1",
            "name": "Maria Silva",
            "email": "maria@example.com",
        },
        {
            "type": "UserCreated",
            "userId": "user-2",
            "name": "João Souza",
            "email": "joao@example.com",
        },
        {
            "type": "UserCreated",
            "userId": "user-3",
            "name": "Ana Lima",
            "email": "ana@example.com",
        },
        {
            "type": "UserCreated",
            "userId": "user-4",
            "name": "Pedro Alves",
            "email": "pedro@example.com",
        },
        {
            "type": "UserCreated",
            "userId": "user-5",
            "name": "Carla Mendes",
            "email": "carla@example.com",
        },
        {
            "type": "ActivityCreated",
            "activityId": act_1,
            "eventId": event_id,
            "name": "Minicurso de FastAPI",
            "description": "Introdução prática a APIs com FastAPI.",
            "location": "Sala 1",
            "startsAt": "2026-11-07T10:00:00Z",
            "endsAt": "2026-11-07T12:00:00Z",
            "capacity": 30,
            "price": 100.0,
            "rules": ["Maiores de 18 anos"],
        },
        {
            "type": "ActivityCreated",
            "activityId": act_2,
            "eventId": event_id,
            "name": "Palestra de Arquitetura",
            "description": "Event-driven architecture na prática.",
            "location": "Auditório",
            "startsAt": "2026-11-08T14:00:00Z",
            "endsAt": "2026-11-08T16:00:00Z",
            "capacity": 20,
            "price": 50.0,
            "rules": [],
        },
        {
            "type": "RegistrationCreated",
            "id": reg[1],
            "userId": "user-1",
            "activityId": act_1,
            "eventId": event_id,
            "status": "confirmed",
        },
        {
            "type": "RegistrationCreated",
            "id": reg[2],
            "userId": "user-2",
            "activityId": act_1,
            "eventId": event_id,
            "status": "confirmed",
        },
        {
            "type": "RegistrationCreated",
            "id": reg[3],
            "userId": "user-3",
            "activityId": act_2,
            "eventId": event_id,
            "status": "pending",
        },
        {
            "type": "RegistrationCreated",
            "id": reg[4],
            "userId": "user-4",
            "activityId": act_2,
            "eventId": event_id,
            "status": "canceled",
            "reasons": ["Desistiu"],
        },
        {
            "type": "RegistrationCreated",
            "id": reg[5],
            "userId": "user-5",
            "activityId": act_2,
            "eventId": event_id,
            "status": "confirmed",
        },
        {
            "type": "PaymentRequested",
            "paymentId": pay_1,
            "registrationId": reg[1],
            "userId": "user-1",
            "amount": 100.0,
            "description": "Inscrição no Minicurso de FastAPI",
        },
        {
            "type": "PaymentApproved",
            "paymentId": pay_1,
            "registrationId": reg[1],
            "userId": "user-1",
            "amount": 100.0,
        },
        {
            "type": "PaymentRequested",
            "paymentId": pay_2,
            "registrationId": reg[2],
            "userId": "user-2",
            "amount": 100.0,
            "description": "Inscrição no Minicurso de FastAPI",
        },
        {
            "type": "UserCheckedIn",
            "activityId": act_1,
            "userId": "user-1",
            "eventId": event_id,
            "checkedInAt": "2026-11-07T10:05:00Z",
        },
        {
            "type": "UserCheckedIn",
            "activityId": act_1,
            "userId": "user-2",
            "eventId": event_id,
            "checkedInAt": "2026-11-07T10:07:00Z",
        },
        {
            "type": "UserCheckedIn",
            "activityId": act_2,
            "userId": "user-3",
            "eventId": event_id,
            "checkedInAt": "2026-11-08T14:10:00Z",
        },
        {
            "type": "EventPublished",
            "eventId": event_id,
            "status": "published",
            "organizers": [organizer],
        },
    ]

    for index, event in enumerate(events):
        event["messageId"] = f"{event['type']}-{event_id}-{index:02d}"
        event["occurredAt"] = _stamp(index)
        event["version"] = 1

    return events
