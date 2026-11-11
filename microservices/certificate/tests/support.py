from __future__ import annotations

from contextlib import contextmanager

import jwt
from fastapi.testclient import TestClient

from app.config import Settings
from app.factory import create_app
from app.infrastructure.database import CertificateRepository
from app.infrastructure.pdf_generator import PdfGenerator

JWT_SECRET = "test-secret-with-more-than-32-bytes"
PUBLIC_BASE_URL = "http://localhost:3005"


def certificate_requested(**overrides) -> dict:
    payload = {
        "type": "CertificateRequested",
        "participantId": "user-1",
        "participantName": "Maria Silva",
        "eventId": "event-1",
        "eventName": "Congresso X",
        "eventDate": "2026-11-07",
        "activities": [{"name": "Minicurso A"}, {"name": "Palestra B"}],
    }
    payload.update(overrides)
    return payload


class RecordingPublisher:
    def __init__(self) -> None:
        self.events: list[dict] = []

    async def connect(self) -> None:
        return None

    async def publish(self, event: dict) -> None:
        self.events.append(event)

    async def close(self) -> None:
        return None


def auth_headers(user_id: str = "user-1", role: str | None = None) -> dict[str, str]:
    payload: dict = {"userId": user_id}
    if role is not None:
        payload["role"] = role
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


def cookie_headers(user_id: str = "user-1") -> dict[str, str]:
    token = jwt.encode({"sub": user_id}, JWT_SECRET, algorithm="HS256")
    return {"Cookie": f"token={token}"}


@contextmanager
def certificate_api(*, event_publisher: RecordingPublisher | None = None):
    repository = CertificateRepository(":memory:")
    publisher = event_publisher or RecordingPublisher()

    app = create_app(
        Settings(
            data_dir=":memory:",
            jwt_secret=JWT_SECRET,
            public_base_url=PUBLIC_BASE_URL,
            rabbitmq_url=None,
        ),
        repository=repository,
        pdf_generator=PdfGenerator(PUBLIC_BASE_URL),
        event_publisher=publisher,
    )

    try:
        with TestClient(app) as client:
            yield client, publisher, repository
    finally:
        repository.close()
