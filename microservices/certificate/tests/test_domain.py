from __future__ import annotations

from types import MappingProxyType

import pytest

from app.domain.certificate import Certificate
from app.domain.errors import BadRequestError

BASE = {
    "user_id": "user-1",
    "event_id": "event-1",
    "participant_name": "Maria Silva",
    "event_name": "Congresso X",
    "event_date": "2026-11-07",
    "activities": [{"name": "Minicurso A"}, {"name": "Palestra B"}],
}


def test_certificate_generates_unique_tokens_and_immutable_snapshot() -> None:
    first = Certificate(**BASE)
    second = Certificate(**{**BASE, "user_id": "user-2"})

    assert first.id != second.id
    assert first.verification_token != second.verification_token
    assert len(first.verification_token) >= 32
    assert isinstance(first.activities, tuple)
    assert isinstance(first.activities[0], MappingProxyType)
    assert [dict(activity) for activity in first.activities] == [
        {"name": "Minicurso A"},
        {"name": "Palestra B"},
    ]


def test_certificate_rejects_invalid_event_date() -> None:
    for invalid in ("07/11/2026", "2026-13-01", "20261107", ""):
        with pytest.raises(BadRequestError):
            Certificate(**{**BASE, "event_date": invalid})


def test_certificate_rejects_empty_activities() -> None:
    with pytest.raises(BadRequestError):
        Certificate(**{**BASE, "activities": []})


def test_certificate_rejects_activity_without_name() -> None:
    with pytest.raises(BadRequestError):
        Certificate(**{**BASE, "activities": [{"name": "  "}]})


def test_metadata_contains_private_fields_and_public_does_not() -> None:
    certificate = Certificate(**BASE)

    metadata = certificate.to_metadata()
    assert metadata["participantName"] == "Maria Silva"
    assert metadata["verificationToken"] == certificate.verification_token
    assert metadata["activities"][0] == {"name": "Minicurso A"}

    public = certificate.to_public()
    assert public["valid"] is True
    assert "userId" not in public
    assert "eventId" not in public
    assert "verificationToken" not in public
