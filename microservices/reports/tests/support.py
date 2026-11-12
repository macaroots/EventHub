from __future__ import annotations

from contextlib import contextmanager
from types import SimpleNamespace

import jwt
from fastapi.testclient import TestClient

from app.application.projections import ProjectionService
from app.config import Settings
from app.factory import create_app
from app.infrastructure.database import ReportsRepository
from dev.fixtures import build_events

JWT_SECRET = "test-secret-with-more-than-32-bytes"
EVENT_ID = "event-1"
ORG_ID = "org-1"
OTHER_ID = "user-9"
ADMIN_ID = "admin-1"


def settings(**overrides) -> Settings:
    values = {
        "data_dir": ":memory:",
        "jwt_secret": JWT_SECRET,
        "rabbitmq_url": None,
        "admin_user_ids": (ADMIN_ID,),
        "max_export_rows": 10000,
    }
    values.update(overrides)
    return Settings(**values)


def auth_headers(user_id: str = ORG_ID, role: str | None = None) -> dict[str, str]:
    payload: dict = {"userId": user_id}
    if role is not None:
        payload["role"] = role
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


def cookie_headers(user_id: str = ORG_ID) -> dict[str, str]:
    token = jwt.encode({"sub": user_id}, JWT_SECRET, algorithm="HS256")
    return {"Cookie": f"token={token}"}


def user(user_id: str = ORG_ID, role: str | None = None):
    return SimpleNamespace(id=user_id, role=role, username=None)


def seed(
    repository: ReportsRepository,
    *,
    event_id: str = EVENT_ID,
    organizer: str = ORG_ID,
) -> ReportsRepository:
    projections = ProjectionService(repository)
    for event in build_events(event_id, organizer):
        projections.apply(event)
    return repository


@contextmanager
def reports_api(**setting_overrides):
    repository = ReportsRepository(":memory:")
    seed(repository)

    app = create_app(
        settings(**setting_overrides),
        repository=repository,
    )

    try:
        with TestClient(app) as client:
            yield client, repository
    finally:
        repository.close()
