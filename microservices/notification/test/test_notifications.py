import time
import uuid
from datetime import datetime, timezone
from dataclasses import replace
import jwt
import pytest
from fastapi.testclient import TestClient
from src.config import Settings
from src.domain.events import Event
from src.infrastructure.database import NotificationRepository
from src.application.notification_service import NotificationService
from src.api.factory import create_app


@pytest.fixture
def settings(tmp_path):
    return Settings(jwt_secret="notification-test-secret-with-32-characters", db_path=str(tmp_path / "notifications.db"))


@pytest.fixture
def store(settings):
    return NotificationRepository(settings.db_path)


def event(kind, data=None, **extra):
    source = "identity" if kind.startswith("User") else "registration" if kind.startswith("Registration") or kind.startswith("CheckIn") or kind == "PaymentRequested" else "payment"
    raw = dict(id=str(uuid.uuid4()), type=kind, source=source,
        time=datetime.now(timezone.utc).isoformat(), data=data or {"registrationId": "r1", "userId": "u1"})
    return Event.parse({**raw, **extra})


def contact(store):
    store.ingest(event("UserRegistered", {"userId": "u1", "name": "Gabriel", "email": "gabriel@example.com"}))


class Sender:
    def __init__(self, fail=False):
        self.calls, self.fail = [], fail

    def send(self, job, recipient):
        self.calls.append((job, recipient))
        if self.fail:
            raise OSError("smtp offline")
        return "sent"


@pytest.mark.parametrize("kind,word", [
    ("PaymentRequested", "confirme sua compra"), ("PaymentConfirmed", "confirmado"),
    ("PaymentDenied", "recusado"), ("PaymentExpired", "expirado"),
    ("PaymentCanceled", "cancelada"), ("RegistrationCanceled", "cancelada"),
    ("RegistrationCreated", "recebida"), ("RegistrationConfirmed", "confirmada"),
])
async def test_scenarios(store, settings, kind, word):
    contact(store)
    data = {"registrationId": "r1", "userId": "u1", "reason": "Canceled by participant"}
    if kind == "RegistrationCreated":
        data["id"] = data.pop("registrationId")
    store.ingest(event(kind, data))
    sender = Sender()
    assert await NotificationService(store, sender, settings).deliver_one()
    row = store.list_for_user("u1")[0]
    assert word in row["subject"]
    assert row["status"] == "sent"
    assert sender.calls[0][1] == "gabriel@example.com"


async def test_dedup_and_expiration_from_registration(store, settings):
    contact(store)
    expired = event("PaymentExpired")
    assert store.ingest(expired)
    assert not store.ingest(expired)
    store.ingest(event("RegistrationCanceled", {"registrationId": "r1", "userId": "u1", "reason": "Payment expired"}))
    sender = Sender()
    service = NotificationService(store, sender, settings)
    await service.deliver_one()
    assert not await service.deliver_one()
    assert len(sender.calls) == len(store.list_for_user("u1")) == 1


async def test_waits_for_contact_and_late_owner_projection(store, settings):
    store.ingest(event("PaymentConfirmed", {"registrationId": "r1"}))
    sender = Sender()
    service = NotificationService(store, sender, settings)
    await service.deliver_one()
    assert not sender.calls
    store.ingest(event("RegistrationCreated", {"id": "r1", "userId": "u1"}))
    contact(store)
    while await service.deliver_one():
        pass
    assert len(sender.calls) == 2
    assert all(row["status"] == "sent" for row in store.list_for_user("u1"))


async def test_smtp_failure_does_not_lose_event_and_retries(store, settings):
    contact(store)
    store.ingest(event("PaymentConfirmed"))
    sender = Sender(fail=True)
    service = NotificationService(store, sender, replace(settings, max_attempts=1))
    await service.deliver_one()
    row = store.list_for_user("u1")[0]
    assert row["status"] == "failed"
    assert row["body"]
    assert store.retry(row["id"], "other-user") == "not_found"
    assert store.retry(row["id"], "u1") == "pending"
    sender.fail = False
    await service.deliver_one()
    assert store.list_for_user("u1")[0]["status"] == "sent"
    assert store.retry(row["id"], "u1") == "conflict"


async def test_automatic_retry_is_bounded(store, settings):
    contact(store)
    store.ingest(event("PaymentDenied"))
    sender = Sender(fail=True)
    service = NotificationService(store, sender, replace(settings, max_attempts=2))
    await service.deliver_one()
    first = store.list_for_user("u1")[0]
    assert first["status"] == "retry" and first["attempts"] == 1
    assert not await service.deliver_one()
    with store.connect() as db:
        db.execute("UPDATE notifications SET next_attempt=0")
    await service.deliver_one()
    row = store.list_for_user("u1")[0]
    assert row["status"] == "failed" and row["attempts"] == 2
    assert not await service.deliver_one()


async def test_log_mode_does_not_claim_email_sent(store, settings, caplog):
    from src.infrastructure.email_sender import EmailSender
    contact(store)
    store.ingest(event("PaymentConfirmed"))
    with caplog.at_level("INFO", logger="notification.email"):
        await NotificationService(store, EmailSender(settings), settings).deliver_one()
    assert store.list_for_user("u1")[0]["status"] == "logged"
    assert "EMAIL_LOG" in caplog.text and "confirmado" in caplog.text


async def test_backoff_limits_and_leases(store, settings):
    contact(store)
    store.ingest(event("PaymentDenied"))
    first = store.claim(300)
    assert first is not None and store.claim(300) is None
    # Um envio antigo não deve finalizar o lease de outro worker.
    with store.connect() as db:
        db.execute("UPDATE notifications SET lease_until=0")
    second = store.claim(300)
    store.finish(first, "sent")
    assert store.list_for_user("u1")[0]["status"] == "sending"
    store.finish(second, "retry", delay=100)
    assert store.claim(300) is None


async def test_terminal_suppresses_obsolete_pending(store, settings):
    contact(store)
    store.ingest(event("PaymentConfirmed"))
    store.ingest(event("PaymentRequested"))
    sender = Sender()
    service = NotificationService(store, sender, settings)
    while await service.deliver_one():
        pass
    assert len(sender.calls) == 1
    assert {row["status"] for row in store.list_for_user("u1")} == {"sent", "skipped"}


async def test_deactivated_contact_and_old_event(store, settings):
    contact(store)
    store.ingest(event("UserDeactivated", {"userId": "u1"}))
    store.ingest(event("UserRegistered", {"userId": "u1", "email": "old@example.com"}, time="2020-01-01T00:00:00Z"))
    store.ingest(event("PaymentConfirmed"))
    sender = Sender()
    await NotificationService(store, sender, settings).deliver_one()
    assert not sender.calls
    assert store.list_for_user("u1")[0]["status"] == "skipped"
    assert not store.upsert_contact("u1", "new@example.com", "New", datetime.now(timezone.utc).isoformat())


def token(settings, user="u1", **claims):
    return jwt.encode({"userId": user, "email": "gabriel@example.com", "exp": time.time()+60, **claims}, settings.jwt_secret, algorithm="HS256")


def test_api_isolation_and_contact_from_jwt(store, settings):
    store.ingest(event("PaymentConfirmed"))
    with TestClient(create_app(settings)) as client:
        assert client.get("/notifications").status_code == 401
        headers = {"Authorization": "Bearer " + token(settings)}
        assert client.put("/contacts/me", headers=headers).status_code == 200
        row = client.get("/notifications", headers=headers).json()["items"][0]
        assert row["user_id"] == "u1"
        other = {"Authorization": "Bearer " + token(settings, "other")}
        assert client.get("/notifications", headers=other).json()["items"] == []
        assert client.post(f"/notifications/{row['id']}/retry", headers=other).status_code == 404
        assert client.post(f"/notifications/{row['id']}/retry", headers=headers).status_code == 409
        assert client.get("/notifications?type=PaymentDenied", headers=headers).json()["items"] == []
        assert client.get("/notifications?limit=1000", headers=headers).status_code == 422
        assert client.get("/health/ready").status_code == 503
        store.heartbeat()
        assert client.get("/health/ready").status_code == 200


@pytest.mark.parametrize("claims", [{"exp": 0}, {"userId": ""}, {"exp": None}])
def test_invalid_tokens(settings, claims):
    with TestClient(create_app(settings)) as client:
        response = client.get("/notifications", headers={"Authorization": "Bearer " + token(settings, **claims)})
        assert response.status_code == 401


def test_invalid_event_is_atomic(store):
    with pytest.raises(ValueError):
        store.ingest(event("UserRegistered", {"userId": "u1", "email": "invalid"}))
    with store.connect() as db:
        assert db.execute("SELECT count(*) FROM inbox").fetchone()[0] == 0
    store.ingest(event("PaymentConfirmed"))
    with pytest.raises(ValueError):
        store.ingest(event("PaymentDenied", {"registrationId": "r1", "userId": "someone-else"}))
    assert len(store.list_for_user("u1")) == 1


async def test_checkin_code_is_private_and_old_codes_are_not_sent(store, settings):
    contact(store)
    data = {"registrationId": "r1", "userId": "u1", "code": "ABC234", "openedAt": "2030-01-01T10:00:00Z"}
    old = event("CheckInOpened", data)
    store.ingest(old)
    store.ingest(event("CheckInOpened", {**data, "code": "XYZ987", "openedAt": "2030-01-01T10:01:00Z"}))
    assert not store.list_for_user("u2")
    sender = Sender()
    service = NotificationService(store, sender, settings)
    assert await service.deliver_one()
    assert len(sender.calls) == 1
    assert "XYZ987" in sender.calls[0][0]["body"]
    assert sender.calls[0][1] == "gabriel@example.com"
    store.ingest(event("CheckInClosed", {"registrationId": "r1", "userId": "u1", "closedAt": "2030-01-01T10:02:00Z"}))
    assert not store.ingest(event("CheckInOpened", data))


def test_event_cancellation_has_a_distinct_message():
    from src.domain.templates import render
    canceled = event("RegistrationCanceled", {"registrationId":"r1", "userId":"u1", "reason":"Event canceled: chuva"})
    assert canceled.notification_type == "EventCanceledNotice"
    subject, body = render(canceled.notification_type, canceled.data)
    assert "Evento cancelado" in subject
    assert "evento" in body and "cancelado" in body


def test_purchase_cancellation_is_not_event_cancellation():
    canceled = event("RegistrationCanceled", {"registrationId":"r1", "userId":"u1", "reason":"Canceled by participant"})
    assert canceled.notification_type == "RegistrationCanceled"


def test_certificate_events_show_activities_and_are_user_scoped(store):
    issued = event("CertificateIssued", {"certificateId":"cert-1", "participantId":"u1", "eventId":"e1", "eventName":"Congresso", "activities":[{"name":"Oficina"}]}, source="certificate")
    denied = event("CertificateDenied", {"userId":"u2", "eventId":"e1", "eventName":"Congresso", "activities":[{"name":"Palestra"}]}, source="registration")
    assert store.ingest(issued)
    assert store.ingest(denied)
    assert "Oficina" in store.list_for_user("u1")[0]["body"]
    assert "Palestra" in store.list_for_user("u2")[0]["body"]
    assert store.list_for_user("u1")[0]["event_type"] == "CertificateIssued"
    assert store.list_for_user("u2")[0]["event_type"] == "CertificateDenied"
