from __future__ import annotations

from app.domain.certificate import Certificate
from app.infrastructure.database import CertificateRepository

BASE = {
    "user_id": "user-1",
    "event_id": "event-1",
    "participant_name": "Maria Silva",
    "event_name": "Congresso X",
    "event_date": "2026-11-07",
    "activities": [{"name": "Minicurso A"}, {"name": "Palestra B"}],
}


def test_add_or_get_is_idempotent_by_user_and_event() -> None:
    repository = CertificateRepository(":memory:")
    try:
        first = repository.add_or_get(Certificate(**BASE))
        second = repository.add_or_get(Certificate(**{**BASE}))

        assert second.id == first.id
        assert second.verification_token == first.verification_token
        assert len(repository.list_by_user("user-1")) == 1
    finally:
        repository.close()


def test_lookup_by_token_and_listing_per_user() -> None:
    repository = CertificateRepository(":memory:")
    try:
        first = repository.add_or_get(Certificate(**BASE))
        repository.add_or_get(Certificate(**{**BASE, "user_id": "user-2"}))

        assert repository.get_by_token(first.verification_token).id == first.id
        assert repository.get_by_id(first.id).id == first.id
        assert len(repository.list_by_user("user-1")) == 1
        assert len(repository.list_by_user("user-2")) == 1
        assert repository.list_by_user("user-3") == []
        assert repository.get_by_token("unknown") is None
    finally:
        repository.close()


def test_certificate_survives_reconnect(tmp_path) -> None:
    database_path = str(tmp_path / "certificate.db")

    repository = CertificateRepository(database_path)
    certificate = repository.add_or_get(Certificate(**BASE))
    repository.close()

    reopened = CertificateRepository(database_path)
    try:
        restored = reopened.get_by_token(certificate.verification_token)
        assert restored is not None
        assert restored.id == certificate.id
        assert [dict(activity) for activity in restored.activities] == [
            {"name": "Minicurso A"},
            {"name": "Palestra B"},
        ]
    finally:
        reopened.close()
