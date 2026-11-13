from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path

from ..domain.certificate import Certificate

_SCHEMA = """
CREATE TABLE IF NOT EXISTS certificates (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL,
    event_id           TEXT NOT NULL,
    participant_name   TEXT NOT NULL,
    event_name         TEXT NOT NULL,
    event_date         TEXT NOT NULL,
    activities         TEXT NOT NULL,
    verification_token TEXT NOT NULL UNIQUE,
    created_at         TEXT NOT NULL,
    UNIQUE (user_id, event_id)
);

CREATE TABLE IF NOT EXISTS certificate_outbox (
    certificate_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_token ON certificates(verification_token);
"""


class CertificateRepository:
    """SQLite persistence for certificates.

    A single connection is shared by the FastAPI worker threads, guarded by a
    lock. Certificate writes are tiny and infrequent, so this is enough for the
    MVP while keeping the implementation dependency-free.
    """

    def __init__(self, database_path: str = ":memory:") -> None:
        if database_path != ":memory:":
            Path(database_path).parent.mkdir(parents=True, exist_ok=True)

        self._lock = threading.RLock()
        self._connection = sqlite3.connect(database_path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        with self._connection:
            self._connection.executescript(_SCHEMA)

    def add_or_get(self, certificate: Certificate) -> Certificate:
        with self._lock, self._connection:
            result = self._connection.execute(
                """
                INSERT INTO certificates (
                    id, user_id, event_id, participant_name, event_name,
                    event_date, activities, verification_token, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (user_id, event_id) DO NOTHING
                """,
                (
                    certificate.id,
                    certificate.user_id,
                    certificate.event_id,
                    certificate.participant_name,
                    certificate.event_name,
                    certificate.event_date,
                    json.dumps([dict(activity) for activity in certificate.activities]),
                    certificate.verification_token,
                    certificate.created_at,
                ),
            )
            if result.rowcount:
                payload = {"type": "CertificateIssued", "certificateId": certificate.id, "participantId": certificate.user_id, "eventId": certificate.event_id, "eventName": certificate.event_name, "activities": [dict(a) for a in certificate.activities], "verificationToken": certificate.verification_token, "issuedAt": certificate.created_at}
                self._connection.execute("INSERT INTO certificate_outbox (certificate_id,payload) VALUES (?,?)", (certificate.id, json.dumps(payload)))

        saved = self.get_by_user_and_event(certificate.user_id, certificate.event_id)
        if saved is None:  # pragma: no cover - defensive, the insert must exist
            raise RuntimeError("certificate could not be persisted")
        return saved

    def get_by_id(self, certificate_id: str) -> Certificate | None:
        row = self._fetch_one("SELECT * FROM certificates WHERE id = ?", (certificate_id,))
        return self._to_certificate(row) if row else None

    def get_by_user_and_event(self, user_id: str, event_id: str) -> Certificate | None:
        row = self._fetch_one(
            "SELECT * FROM certificates WHERE user_id = ? AND event_id = ?",
            (user_id, event_id),
        )
        return self._to_certificate(row) if row else None

    def get_by_token(self, verification_token: str) -> Certificate | None:
        row = self._fetch_one(
            "SELECT * FROM certificates WHERE verification_token = ?",
            (verification_token,),
        )
        return self._to_certificate(row) if row else None

    def list_by_user(self, user_id: str) -> list[Certificate]:
        with self._lock:
            rows = self._connection.execute(
                "SELECT * FROM certificates WHERE user_id = ? ORDER BY created_at DESC, id",
                (user_id,),
            ).fetchall()
        return [self._to_certificate(row) for row in rows]

    def pending_events(self):
        with self._lock:
            rows = self._connection.execute("SELECT certificate_id,payload FROM certificate_outbox ORDER BY rowid").fetchall()
            return [(row["certificate_id"], json.loads(row["payload"])) for row in rows]

    def mark_published(self, certificate_id):
        with self._lock, self._connection:
            self._connection.execute("DELETE FROM certificate_outbox WHERE certificate_id=?", (certificate_id,))

    def healthcheck(self) -> bool:
        with self._lock:
            self._connection.execute("SELECT 1").fetchone()
        return True

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def _fetch_one(self, sql: str, parameters: tuple) -> sqlite3.Row | None:
        with self._lock:
            return self._connection.execute(sql, parameters).fetchone()

    @staticmethod
    def _to_certificate(row: sqlite3.Row) -> Certificate:
        return Certificate(
            id=row["id"],
            user_id=row["user_id"],
            event_id=row["event_id"],
            participant_name=row["participant_name"],
            event_name=row["event_name"],
            event_date=row["event_date"],
            activities=tuple(json.loads(row["activities"])),
            verification_token=row["verification_token"],
            created_at=row["created_at"],
        )
