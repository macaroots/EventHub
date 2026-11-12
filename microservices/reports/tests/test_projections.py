from __future__ import annotations

from app.application.projections import ProjectionService
from app.infrastructure.database import ReportsRepository
from tests.support import seed


def apply(repository: ReportsRepository, payload: dict):
    return ProjectionService(repository).apply(payload)


def event_created(**overrides) -> dict:
    payload = {
        "type": "EventCreated",
        "eventId": "event-1",
        "name": "Congresso",
        "status": "draft",
        "organizers": ["org-1"],
    }
    payload.update(overrides)
    return payload


def activity_created(**overrides) -> dict:
    payload = {
        "type": "ActivityCreated",
        "activityId": "act-1",
        "eventId": "event-1",
        "name": "Minicurso",
        "capacity": 30,
        "price": 100.0,
    }
    payload.update(overrides)
    return payload


def test_seed_produces_the_expected_projection(seeded: ReportsRepository) -> None:
    registrations = seeded.list_registrations(event_id="event-1")
    attendances = seeded.list_attendances(event_id="event-1")

    assert len(registrations) == 5
    assert sorted(item.status for item in registrations) == [
        "canceled",
        "confirmed",
        "confirmed",
        "confirmed",
        "pending",
    ]
    assert len({(item.activity_id, item.user_id) for item in attendances}) == 3
    assert seeded.get_event("event-1").status == "published"
    assert seeded.get_event("event-1").organizers == ("org-1",)
    assert seeded.get_activity("event-1-act-1").price == 100.0


def test_duplicate_message_id_is_ignored(repository: ReportsRepository) -> None:
    payload = event_created(messageId="msg-1")

    first = apply(repository, payload)
    second = apply(repository, payload)

    assert first.applied is True
    assert second.applied is False
    assert second.ignored is True
    assert second.unknown is False


def test_unknown_event_is_ignored_but_acknowledged(repository: ReportsRepository) -> None:
    result = apply(repository, {"type": "SomethingNew"})

    assert result.applied is False
    assert result.ignored is True
    assert result.unknown is True


def test_older_event_update_is_ignored(repository: ReportsRepository) -> None:
    apply(
        repository,
        event_created(occurredAt="2026-11-01T12:00:00Z", name="Novo"),
    )
    apply(
        repository,
        {
            "type": "EventUpdated",
            "eventId": "event-1",
            "name": "Antigo",
            "occurredAt": "2026-11-01T11:00:00Z",
        },
    )

    assert repository.get_event("event-1").name == "Novo"


def test_canceled_event_is_terminal(repository: ReportsRepository) -> None:
    apply(
        repository,
        event_created(occurredAt="2026-11-01T10:00:00Z"),
    )
    apply(
        repository,
        {
            "type": "EventCanceled",
            "eventId": "event-1",
            "reason": "Sem local",
            "occurredAt": "2026-11-01T11:00:00Z",
        },
    )
    apply(
        repository,
        {
            "type": "EventPublished",
            "eventId": "event-1",
            "occurredAt": "2026-11-01T12:00:00Z",
        },
    )

    event = repository.get_event("event-1")
    assert event.status == "canceled"
    assert event.cancel_reason == "Sem local"


def test_canceled_registration_is_not_reopened(repository: ReportsRepository) -> None:
    apply(
        repository,
        {
            "type": "RegistrationCreated",
            "id": "reg-1",
            "userId": "user-1",
            "activityId": "act-1",
            "status": "confirmed",
            "occurredAt": "2026-11-01T10:00:00Z",
        },
    )
    apply(
        repository,
        {
            "type": "RegistrationCanceled",
            "registrationId": "reg-1",
            "reason": "Desistiu",
            "occurredAt": "2026-11-01T11:00:00Z",
        },
    )
    apply(
        repository,
        {
            "type": "RegistrationConfirmed",
            "registrationId": "reg-1",
            "occurredAt": "2026-11-01T12:00:00Z",
        },
    )

    registration = repository.list_registrations(event_id=None)[0]
    assert registration.status == "canceled"
    assert registration.reasons == ("Desistiu",)


def test_activity_created_relinks_registrations_and_attendances(
    repository: ReportsRepository,
) -> None:
    apply(
        repository,
        {
            "type": "RegistrationCreated",
            "id": "reg-1",
            "userId": "user-1",
            "activityId": "act-1",
        },
    )
    apply(
        repository,
        {
            "type": "UserCheckedIn",
            "activityId": "act-1",
            "userId": "user-1",
            "checkedInAt": "2026-11-01T10:00:00Z",
        },
    )

    assert repository.list_registrations()[0].event_id is None
    assert repository.list_attendances()[0].event_id is None

    apply(repository, activity_created())

    assert repository.list_registrations()[0].event_id == "event-1"
    assert repository.list_attendances()[0].event_id == "event-1"


def test_checked_in_is_idempotent_and_preserves_first_timestamp(
    repository: ReportsRepository,
) -> None:
    apply(repository, activity_created())
    apply(
        repository,
        {
            "type": "UserCheckedIn",
            "activityId": "act-1",
            "userId": "user-1",
            "checkedInAt": "2026-11-01T10:00:00Z",
        },
    )
    apply(
        repository,
        {
            "type": "UserCheckedIn",
            "activityId": "act-1",
            "userId": "user-1",
            "checkedInAt": "2026-11-01T11:00:00Z",
        },
    )

    attendances = repository.list_attendances()
    assert len(attendances) == 1
    assert attendances[0].checked_in_at == "2026-11-01T10:00:00.000Z"


def test_older_registration_does_not_downgrade_status(
    repository: ReportsRepository,
) -> None:
    apply(
        repository,
        {
            "type": "RegistrationCreated",
            "id": "reg-1",
            "userId": "user-1",
            "activityId": "act-1",
            "status": "confirmed",
            "occurredAt": "2026-11-01T12:00:00Z",
        },
    )
    apply(
        repository,
        {
            "type": "RegistrationCreated",
            "id": "reg-1",
            "userId": "user-1",
            "activityId": "act-1",
            "status": "pending",
            "occurredAt": "2026-11-01T11:00:00Z",
        },
    )

    assert repository.list_registrations()[0].status == "confirmed"


def test_approved_payment_is_terminal(repository: ReportsRepository) -> None:
    apply(
        repository,
        {
            "type": "PaymentRequested",
            "paymentId": "pay-1",
            "registrationId": "reg-1",
            "amount": 100.0,
            "occurredAt": "2026-11-01T10:00:00Z",
        },
    )
    apply(
        repository,
        {
            "type": "PaymentApproved",
            "paymentId": "pay-1",
            "registrationId": "reg-1",
            "amount": 100.0,
            "occurredAt": "2026-11-01T11:00:00Z",
        },
    )
    apply(
        repository,
        {
            "type": "PaymentRequested",
            "paymentId": "pay-1",
            "registrationId": "reg-1",
            "amount": 100.0,
            "occurredAt": "2026-11-01T12:00:00Z",
        },
    )

    payment = repository.list_payments()[0]
    assert payment.status == "approved"
    assert payment.amount_cents == 10000


def test_deleted_event_is_soft_deleted(repository: ReportsRepository) -> None:
    apply(repository, event_created())
    apply(repository, {"type": "EventDeleted", "eventId": "event-1"})

    assert repository.get_event("event-1").deleted is True


def test_seed_is_idempotent(repository: ReportsRepository) -> None:
    seed(repository)
    first = len(repository.list_registrations(event_id="event-1"))

    results = ProjectionService(repository)
    from dev.fixtures import build_events

    for event in build_events("event-1", "org-1"):
        assert results.apply(event).applied is False

    assert len(repository.list_registrations(event_id="event-1")) == first
