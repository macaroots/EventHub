from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence

from ..application.events import ParsedEvent
from ..domain.models import (
    Activity,
    ApplyResult,
    Attendance,
    Event,
    Participant,
    Payment,
    Registration,
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    information   TEXT,
    start_date    TEXT,
    end_date      TEXT,
    status        TEXT NOT NULL DEFAULT 'draft',
    cancel_reason TEXT,
    organizers    TEXT NOT NULL DEFAULT '[]',
    source_at     TEXT,
    updated_at    TEXT NOT NULL,
    deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS activities (
    id          TEXT PRIMARY KEY,
    event_id    TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    location    TEXT,
    starts_at   TEXT,
    ends_at     TEXT,
    capacity    INTEGER NOT NULL DEFAULT 0,
    price_cents INTEGER NOT NULL DEFAULT 0,
    rules       TEXT NOT NULL DEFAULT '[]',
    source_at   TEXT,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_activities_event ON activities(event_id);

CREATE TABLE IF NOT EXISTS registrations (
    id           TEXT PRIMARY KEY,
    event_id     TEXT,
    activity_id  TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    requirements TEXT NOT NULL DEFAULT '[]',
    reasons      TEXT NOT NULL DEFAULT '[]',
    source_at    TEXT,
    updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_registrations_event ON registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_activity ON registrations(activity_id);
CREATE INDEX IF NOT EXISTS idx_registrations_user ON registrations(user_id);

CREATE TABLE IF NOT EXISTS attendances (
    activity_id   TEXT NOT NULL,
    user_id       TEXT NOT NULL,
    event_id      TEXT,
    checked_in_at TEXT NOT NULL,
    source_at     TEXT,
    PRIMARY KEY (activity_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_attendances_event ON attendances(event_id);

CREATE TABLE IF NOT EXISTS payments (
    id              TEXT PRIMARY KEY,
    registration_id TEXT,
    user_id         TEXT,
    amount_cents    INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'requested',
    description     TEXT,
    reason          TEXT,
    source_at       TEXT,
    updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_registration ON payments(registration_id);

CREATE TABLE IF NOT EXISTS participants (
    id         TEXT PRIMARY KEY,
    name       TEXT,
    email      TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inbox (
    message_id  TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_state (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _json_load(value: Any, default: Any) -> Any:
    if value is None:
        return default
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default


def _json_tuple(value: Any) -> tuple:
    loaded = _json_load(value, [])
    return tuple(loaded if isinstance(loaded, list) else [])


class ReportsRepository:
    """SQLite read model for reports.

    A single connection is shared by FastAPI worker threads and the consumer,
    guarded by a lock. Reports are read-only projections, so this is enough for
    the MVP while keeping the implementation dependency-free.
    """

    def __init__(self, database_path: str = ":memory:") -> None:
        if database_path != ":memory:":
            Path(database_path).parent.mkdir(parents=True, exist_ok=True)

        self._lock = threading.RLock()
        self._connection = sqlite3.connect(
            database_path,
            check_same_thread=False,
            isolation_level=None,
        )
        self._connection.row_factory = sqlite3.Row
        self._connection.execute("PRAGMA journal_mode = WAL")
        self._connection.executescript(_SCHEMA)

    # ------------------------------------------------------------------ #
    # Projection writes
    # ------------------------------------------------------------------ #

    @contextmanager
    def transaction(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            self._connection.execute("BEGIN")
            try:
                yield self._connection
                self._connection.execute("COMMIT")
            except BaseException:
                self._connection.execute("ROLLBACK")
                raise

    def apply(self, event: ParsedEvent) -> ApplyResult:
        with self.transaction() as conn:
            if event.message_id:
                duplicate = conn.execute(
                    "SELECT 1 FROM inbox WHERE message_id = ?",
                    (event.message_id,),
                ).fetchone()
                if duplicate:
                    return ApplyResult(
                        applied=False,
                        ignored=True,
                        event_type=event.type,
                    )

            handler = _HANDLERS.get(event.type)
            if handler is None:
                return ApplyResult(
                    applied=False,
                    ignored=True,
                    unknown=True,
                    event_type=event.type,
                )

            handler(self, conn, event)

            now = _now_iso()
            source = event.occurred_at or now
            if event.message_id:
                conn.execute(
                    "INSERT OR REPLACE INTO inbox (message_id, type, received_at)"
                    " VALUES (?, ?, ?)",
                    (event.message_id, event.type, now),
                )
            conn.execute(
                "INSERT OR REPLACE INTO service_state (key, value)"
                " VALUES ('lastEventAt', ?)",
                (source,),
            )
            conn.execute(
                "INSERT OR REPLACE INTO service_state (key, value)"
                " VALUES ('lastMessageType', ?)",
                (event.type,),
            )
            return ApplyResult(applied=True, event_type=event.type)

    def _apply_event_created(self, conn: sqlite3.Connection, event: ParsedEvent) -> None:
        data = event.data
        now = _now_iso()
        source = event.occurred_at or now
        conn.execute(
            """
            INSERT INTO events (
                id, name, information, start_date, end_date, status,
                cancel_reason, organizers, source_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                name = excluded.name,
                information = excluded.information,
                start_date = excluded.start_date,
                end_date = excluded.end_date,
                status = CASE
                    WHEN events.status = 'canceled' THEN 'canceled'
                    ELSE excluded.status
                END,
                organizers = excluded.organizers,
                source_at = excluded.source_at,
                updated_at = excluded.updated_at
            WHERE events.source_at IS NULL
               OR excluded.source_at IS NULL
               OR excluded.source_at >= events.source_at
            """,
            (
                data["eventId"],
                data["name"],
                data.get("information"),
                data.get("startDate"),
                data.get("endDate"),
                data.get("status", "draft"),
                None,
                _json_dump(data.get("organizers", [])),
                source,
                now,
            ),
        )

    def _upsert_event_fields(
        self,
        conn: sqlite3.Connection,
        event: ParsedEvent,
        data: dict[str, Any],
    ) -> None:
        now = _now_iso()
        source = event.occurred_at or now
        event_id = data["eventId"]

        exists = conn.execute(
            "SELECT 1 FROM events WHERE id = ?", (event_id,)
        ).fetchone()
        if exists is None:
            conn.execute(
                """
                INSERT INTO events (
                    id, name, information, start_date, end_date, status,
                    cancel_reason, organizers, source_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    data.get("name") or "",
                    data.get("information"),
                    data.get("startDate"),
                    data.get("endDate"),
                    data.get("status", "draft"),
                    data.get("cancelReason"),
                    _json_dump(data.get("organizers", [])),
                    source,
                    now,
                ),
            )

        assignments: list[str] = []
        parameters: list[Any] = []
        for key, column in (
            ("name", "name"),
            ("information", "information"),
            ("startDate", "start_date"),
            ("endDate", "end_date"),
        ):
            if key in data:
                assignments.append(f"{column} = ?")
                parameters.append(data[key])

        if "status" in data:
            assignments.append(
                "status = CASE WHEN status = 'canceled' THEN 'canceled' ELSE ? END"
            )
            parameters.append(data["status"])

        if "organizers" in data:
            assignments.append("organizers = ?")
            parameters.append(_json_dump(data["organizers"]))

        if "cancelReason" in data:
            assignments.append("cancel_reason = ?")
            parameters.append(data["cancelReason"])

        assignments.append("updated_at = ?")
        parameters.append(now)
        assignments.append("source_at = ?")
        parameters.append(source)

        parameters.append(event_id)
        parameters.extend([source, source])

        conn.execute(
            f"UPDATE events SET {', '.join(assignments)} WHERE id = ?"
            " AND (source_at IS NULL OR ? IS NULL OR ? >= source_at)",
            parameters,
        )

    def _apply_event_updated(self, conn: sqlite3.Connection, event: ParsedEvent) -> None:
        self._upsert_event_fields(conn, event, event.data)

    def _apply_event_published(self, conn: sqlite3.Connection, event: ParsedEvent) -> None:
        data = {**event.data, "status": "published"}
        self._upsert_event_fields(conn, event, data)

    def _apply_event_canceled(self, conn: sqlite3.Connection, event: ParsedEvent) -> None:
        data = {**event.data, "status": "canceled"}
        self._upsert_event_fields(conn, event, data)

    def _apply_event_deleted(self, conn: sqlite3.Connection, event: ParsedEvent) -> None:
        now = _now_iso()
        source = event.occurred_at or now
        event_id = event.data["eventId"]

        exists = conn.execute(
            "SELECT 1 FROM events WHERE id = ?", (event_id,)
        ).fetchone()
        if exists is None:
            conn.execute(
                """
                INSERT INTO events (
                    id, name, status, organizers, source_at, updated_at, deleted_at
                ) VALUES (?, '', 'draft', '[]', ?, ?, ?)
                """,
                (event_id, source, now, now),
            )
            return

        conn.execute(
            "UPDATE events SET deleted_at = ?, updated_at = ?, source_at = ?"
            " WHERE id = ?"
            " AND (source_at IS NULL OR ? IS NULL OR ? >= source_at)",
            (now, now, source, event_id, source, source),
        )

    def _apply_activity_created(
        self, conn: sqlite3.Connection, event: ParsedEvent
    ) -> None:
        data = event.data
        now = _now_iso()
        source = event.occurred_at or now
        conn.execute(
            """
            INSERT INTO activities (
                id, event_id, name, description, location, starts_at, ends_at,
                capacity, price_cents, rules, source_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                event_id = excluded.event_id,
                name = excluded.name,
                description = excluded.description,
                location = excluded.location,
                starts_at = excluded.starts_at,
                ends_at = excluded.ends_at,
                capacity = excluded.capacity,
                price_cents = excluded.price_cents,
                rules = excluded.rules,
                source_at = excluded.source_at,
                updated_at = excluded.updated_at
            WHERE activities.source_at IS NULL
               OR excluded.source_at IS NULL
               OR excluded.source_at >= activities.source_at
            """,
            (
                data["activityId"],
                data["eventId"],
                data["name"],
                data.get("description"),
                data.get("location"),
                data.get("startsAt"),
                data.get("endsAt"),
                data.get("capacity", 0),
                data.get("priceCents", 0),
                _json_dump(data.get("rules", [])),
                source,
                now,
            ),
        )
        self._relink_activity(conn, data["activityId"], data["eventId"])

    def _relink_activity(
        self, conn: sqlite3.Connection, activity_id: str, event_id: str
    ) -> None:
        conn.execute(
            "UPDATE registrations SET event_id = ?"
            " WHERE activity_id = ? AND event_id IS NULL",
            (event_id, activity_id),
        )
        conn.execute(
            "UPDATE attendances SET event_id = ?"
            " WHERE activity_id = ? AND event_id IS NULL",
            (event_id, activity_id),
        )

    def _apply_activity_updated(
        self, conn: sqlite3.Connection, event: ParsedEvent
    ) -> None:
        data = event.data
        now = _now_iso()
        source = event.occurred_at or now
        activity_id = data["activityId"]

        exists = conn.execute(
            "SELECT 1 FROM activities WHERE id = ?", (activity_id,)
        ).fetchone()
        if exists is None:
            conn.execute(
                """
                INSERT INTO activities (
                    id, event_id, name, capacity, price_cents, rules,
                    source_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    activity_id,
                    data.get("eventId") or "",
                    data.get("name") or "",
                    data.get("capacity", 0),
                    data.get("priceCents", 0),
                    _json_dump(data.get("rules", [])),
                    source,
                    now,
                ),
            )

        assignments: list[str] = []
        parameters: list[Any] = []
        for key, column in (
            ("eventId", "event_id"),
            ("name", "name"),
            ("description", "description"),
            ("location", "location"),
            ("startsAt", "starts_at"),
            ("endsAt", "ends_at"),
            ("capacity", "capacity"),
            ("priceCents", "price_cents"),
        ):
            if key in data:
                assignments.append(f"{column} = ?")
                parameters.append(data[key])

        if "rules" in data:
            assignments.append("rules = ?")
            parameters.append(_json_dump(data["rules"]))

        assignments.append("updated_at = ?")
        parameters.append(now)
        assignments.append("source_at = ?")
        parameters.append(source)

        parameters.append(activity_id)
        parameters.extend([source, source])

        conn.execute(
            f"UPDATE activities SET {', '.join(assignments)} WHERE id = ?"
            " AND (source_at IS NULL OR ? IS NULL OR ? >= source_at)",
            parameters,
        )

        event_id = data.get("eventId")
        if event_id:
            self._relink_activity(conn, activity_id, event_id)

    def _apply_activity_deleted(
        self, conn: sqlite3.Connection, event: ParsedEvent
    ) -> None:
        now = _now_iso()
        source = event.occurred_at or now
        activity_id = event.data["activityId"]

        exists = conn.execute(
            "SELECT 1 FROM activities WHERE id = ?", (activity_id,)
        ).fetchone()
        if exists is None:
            conn.execute(
                """
                INSERT INTO activities (
                    id, event_id, name, capacity, price_cents, rules,
                    source_at, updated_at, deleted_at
                ) VALUES (?, '', '', 0, 0, '[]', ?, ?, ?)
                """,
                (activity_id, source, now, now),
            )
            return

        conn.execute(
            "UPDATE activities SET deleted_at = ?, updated_at = ?, source_at = ?"
            " WHERE id = ?"
            " AND (source_at IS NULL OR ? IS NULL OR ? >= source_at)",
            (now, now, source, activity_id, source, source),
        )

    def _apply_registration_created(
        self, conn: sqlite3.Connection, event: ParsedEvent
    ) -> None:
        data = event.data
        now = _now_iso()
        source = event.occurred_at or now
        conn.execute(
            """
            INSERT INTO registrations (
                id, event_id, activity_id, user_id, status,
                requirements, reasons, source_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                event_id = COALESCE(excluded.event_id, registrations.event_id),
                activity_id = excluded.activity_id,
                user_id = excluded.user_id,
                status = CASE
                    WHEN registrations.status = 'canceled' THEN 'canceled'
                    WHEN registrations.status = 'confirmed'
                         AND excluded.status = 'pending' THEN 'confirmed'
                    ELSE excluded.status
                END,
                requirements = excluded.requirements,
                reasons = excluded.reasons,
                source_at = excluded.source_at,
                updated_at = excluded.updated_at
            WHERE registrations.source_at IS NULL
               OR excluded.source_at IS NULL
               OR excluded.source_at >= registrations.source_at
            """,
            (
                data["id"],
                data.get("eventId"),
                data["activityId"],
                data["userId"],
                data.get("status", "pending"),
                _json_dump(data.get("requirements", [])),
                _json_dump(data.get("reasons", [])),
                source,
                now,
            ),
        )
        conn.execute(
            "UPDATE registrations SET event_id = COALESCE("
            "event_id, (SELECT event_id FROM activities WHERE id = ?))"
            " WHERE id = ?",
            (data["activityId"], data["id"]),
        )

    def _apply_registration_promoted(self, conn: sqlite3.Connection, event: ParsedEvent) -> None:
        now = _now_iso()
        source = event.occurred_at or now
        conn.execute("UPDATE registrations SET status='pending', source_at=?, updated_at=? WHERE id=? AND status='waitlisted' AND (source_at IS NULL OR ? >= source_at)", (source, now, event.data['registrationId'], source))

    def _apply_registration_confirmed(
        self, conn: sqlite3.Connection, event: ParsedEvent
    ) -> None:
        data = event.data
        now = _now_iso()
        source = event.occurred_at or now
        conn.execute(
            """
            UPDATE registrations SET
                status = CASE
                    WHEN status = 'canceled' THEN 'canceled'
                    ELSE 'confirmed'
                END,
                event_id = COALESCE(event_id, ?),
                source_at = ?,
                updated_at = ?
            WHERE id = ?
              AND (source_at IS NULL OR ? IS NULL OR ? >= source_at)
            """,
            (
                data.get("eventId"),
                source,
                now,
                data["registrationId"],
                source,
                source,
            ),
        )

    def _apply_registration_canceled(
        self, conn: sqlite3.Connection, event: ParsedEvent
    ) -> None:
        data = event.data
        now = _now_iso()
        source = event.occurred_at or now
        registration_id = data["registrationId"]

        row = conn.execute(
            "SELECT reasons FROM registrations WHERE id = ?",
            (registration_id,),
        ).fetchone()
        if row is None:
            return

        reasons = list(_json_load(row["reasons"], []))
        reason = data.get("reason")
        if reason is not None and reason not in reasons:
            reasons.append(reason)

        conn.execute(
            """
            UPDATE registrations SET
                status = 'canceled',
                reasons = ?,
                event_id = COALESCE(event_id, ?),
                source_at = ?,
                updated_at = ?
            WHERE id = ?
              AND (source_at IS NULL OR ? IS NULL OR ? >= source_at)
            """,
            (
                _json_dump(reasons),
                data.get("eventId"),
                source,
                now,
                registration_id,
                source,
                source,
            ),
        )

    def _apply_payment_requested(
        self, conn: sqlite3.Connection, event: ParsedEvent
    ) -> None:
        data = event.data
        now = _now_iso()
        source = event.occurred_at or now
        conn.execute(
            """
            INSERT INTO payments (
                id, registration_id, user_id, amount_cents, status,
                description, source_at, updated_at
            ) VALUES (?, ?, ?, ?, 'requested', ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                registration_id = COALESCE(
                    excluded.registration_id, payments.registration_id
                ),
                user_id = COALESCE(excluded.user_id, payments.user_id),
                amount_cents = excluded.amount_cents,
                status = CASE
                    WHEN payments.status IN ('approved', 'denied')
                        THEN payments.status
                    ELSE 'requested'
                END,
                description = COALESCE(
                    excluded.description, payments.description
                ),
                source_at = excluded.source_at,
                updated_at = excluded.updated_at
            WHERE payments.source_at IS NULL
               OR excluded.source_at IS NULL
               OR excluded.source_at >= payments.source_at
            """,
            (
                data["paymentId"],
                data["registrationId"],
                data.get("userId"),
                data.get("amountCents", 0),
                data.get("description"),
                source,
                now,
            ),
        )

    def _apply_payment_approved(
        self, conn: sqlite3.Connection, event: ParsedEvent
    ) -> None:
        data = event.data
        now = _now_iso()
        source = event.occurred_at or now
        conn.execute(
            """
            INSERT INTO payments (
                id, registration_id, amount_cents, status, source_at, updated_at
            ) VALUES (?, ?, ?, 'approved', ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                registration_id = COALESCE(
                    excluded.registration_id, payments.registration_id
                ),
                amount_cents = CASE
                    WHEN excluded.amount_cents > 0
                        THEN excluded.amount_cents
                    ELSE payments.amount_cents
                END,
                status = 'approved',
                source_at = excluded.source_at,
                updated_at = excluded.updated_at
            WHERE payments.source_at IS NULL
               OR excluded.source_at IS NULL
               OR excluded.source_at >= payments.source_at
            """,
            (
                data["paymentId"],
                data.get("registrationId"),
                data.get("amountCents") or 0,
                source,
                now,
            ),
        )

    def _apply_payment_denied(
        self, conn: sqlite3.Connection, event: ParsedEvent
    ) -> None:
        data = event.data
        now = _now_iso()
        source = event.occurred_at or now
        conn.execute(
            """
            INSERT INTO payments (
                id, registration_id, status, reason, source_at, updated_at
            ) VALUES (?, ?, 'denied', ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                registration_id = COALESCE(
                    excluded.registration_id, payments.registration_id
                ),
                status = 'denied',
                reason = COALESCE(excluded.reason, payments.reason),
                source_at = excluded.source_at,
                updated_at = excluded.updated_at
            WHERE payments.source_at IS NULL
               OR excluded.source_at IS NULL
               OR excluded.source_at >= payments.source_at
            """,
            (
                data["paymentId"],
                data.get("registrationId"),
                data.get("reason"),
                source,
                now,
            ),
        )

    def _apply_user_checked_in(
        self, conn: sqlite3.Connection, event: ParsedEvent
    ) -> None:
        data = event.data
        now = _now_iso()
        source = event.occurred_at or now
        conn.execute(
            """
            INSERT INTO attendances (
                activity_id, user_id, event_id, checked_in_at, source_at
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (activity_id, user_id) DO NOTHING
            """,
            (
                data["activityId"],
                data["userId"],
                data.get("eventId"),
                data["checkedInAt"],
                source,
            ),
        )
        conn.execute(
            "UPDATE attendances SET event_id = COALESCE("
            "event_id, (SELECT event_id FROM activities WHERE id = ?))"
            " WHERE activity_id = ? AND user_id = ?",
            (data["activityId"], data["activityId"], data["userId"]),
        )

    def _apply_user_created(
        self, conn: sqlite3.Connection, event: ParsedEvent
    ) -> None:
        data = event.data
        now = _now_iso()
        conn.execute(
            """
            INSERT INTO participants (id, name, email, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                name = COALESCE(excluded.name, participants.name),
                email = COALESCE(excluded.email, participants.email),
                updated_at = excluded.updated_at
            """,
            (data["userId"], data.get("name"), data.get("email"), now),
        )

    def _apply_user_updated(
        self, conn: sqlite3.Connection, event: ParsedEvent
    ) -> None:
        self._apply_user_created(conn, event)

    # ------------------------------------------------------------------ #
    # Queries
    # ------------------------------------------------------------------ #

    def get_event(self, event_id: str) -> Event | None:
        row = self._fetch_one("SELECT * FROM events WHERE id = ?", (event_id,))
        return _row_to_event(row) if row else None

    def get_activity(self, activity_id: str) -> Activity | None:
        row = self._fetch_one(
            "SELECT * FROM activities WHERE id = ?", (activity_id,)
        )
        return _row_to_activity(row) if row else None

    def list_activities(
        self, event_id: str, *, include_deleted: bool = False
    ) -> list[Activity]:
        sql = "SELECT * FROM activities WHERE event_id = ?"
        if not include_deleted:
            sql += " AND deleted_at IS NULL"
        sql += " ORDER BY COALESCE(starts_at, ''), name, id"
        rows = self._fetch_all(sql, (event_id,))
        return [_row_to_activity(row) for row in rows]

    def list_registrations(
        self,
        *,
        event_id: str | None = None,
        activity_id: str | None = None,
    ) -> list[Registration]:
        sql = (
            "SELECT r.* FROM registrations r"
            " LEFT JOIN activities a ON a.id = r.activity_id"
        )
        conditions: list[str] = []
        parameters: list[Any] = []
        if event_id is not None:
            conditions.append("COALESCE(r.event_id, a.event_id) = ?")
            parameters.append(event_id)
        if activity_id is not None:
            conditions.append("r.activity_id = ?")
            parameters.append(activity_id)
        if conditions:
            sql += " WHERE " + " AND ".join(conditions)
        sql += " ORDER BY r.id"
        return [_row_to_registration(row) for row in self._fetch_all(sql, parameters)]

    def list_attendances(
        self,
        *,
        event_id: str | None = None,
        activity_id: str | None = None,
    ) -> list[Attendance]:
        sql = (
            "SELECT att.* FROM attendances att"
            " LEFT JOIN activities a ON a.id = att.activity_id"
        )
        conditions: list[str] = []
        parameters: list[Any] = []
        if event_id is not None:
            conditions.append("COALESCE(att.event_id, a.event_id) = ?")
            parameters.append(event_id)
        if activity_id is not None:
            conditions.append("att.activity_id = ?")
            parameters.append(activity_id)
        if conditions:
            sql += " WHERE " + " AND ".join(conditions)
        sql += " ORDER BY att.activity_id, att.user_id"
        return [_row_to_attendance(row) for row in self._fetch_all(sql, parameters)]

    def list_payments(
        self,
        *,
        event_id: str | None = None,
        activity_id: str | None = None,
        registration_ids: Sequence[str] | None = None,
    ) -> list[Payment]:
        if registration_ids is not None:
            ids = list(registration_ids)
            if not ids:
                return []
            placeholders = ",".join("?" for _ in ids)
            sql = f"SELECT * FROM payments WHERE registration_id IN ({placeholders})"
            rows = self._fetch_all(sql, ids)
            return [_row_to_payment(row) for row in rows]

        sql = (
            "SELECT p.* FROM payments p"
            " LEFT JOIN registrations r ON r.id = p.registration_id"
            " LEFT JOIN activities a ON a.id = r.activity_id"
        )
        conditions: list[str] = []
        parameters: list[Any] = []
        if event_id is not None:
            conditions.append("COALESCE(r.event_id, a.event_id) = ?")
            parameters.append(event_id)
        if activity_id is not None:
            conditions.append("r.activity_id = ?")
            parameters.append(activity_id)
        if conditions:
            sql += " WHERE " + " AND ".join(conditions)
        sql += " ORDER BY p.id"
        return [_row_to_payment(row) for row in self._fetch_all(sql, parameters)]

    def list_participants(
        self,
        event_id: str,
        *,
        activity_id: str | None = None,
        statuses: Sequence[str] | None = None,
        checked_in: bool | None = None,
        page: int | None = None,
        limit: int | None = None,
    ) -> tuple[list[dict], int]:
        conditions = ["COALESCE(r.event_id, a.event_id) = ?"]
        parameters: list[Any] = [event_id]

        if activity_id:
            conditions.append("r.activity_id = ?")
            parameters.append(activity_id)

        if statuses:
            placeholders = ",".join("?" for _ in statuses)
            conditions.append(f"r.status IN ({placeholders})")
            parameters.extend(statuses)

        if checked_in is True:
            conditions.append(
                "EXISTS (SELECT 1 FROM attendances att"
                " WHERE att.activity_id = r.activity_id"
                " AND att.user_id = r.user_id)"
            )
        elif checked_in is False:
            conditions.append(
                "NOT EXISTS (SELECT 1 FROM attendances att"
                " WHERE att.activity_id = r.activity_id"
                " AND att.user_id = r.user_id)"
            )

        base = (
            " FROM registrations r"
            " LEFT JOIN activities a ON a.id = r.activity_id"
            " LEFT JOIN participants p ON p.id = r.user_id"
            " WHERE " + " AND ".join(conditions)
        )

        total = self._fetch_one(
            f"SELECT COUNT(*) AS total{base}", parameters
        )["total"]

        sql = (
            "SELECT r.id AS registration_id, r.user_id, r.activity_id,"
            " r.status, r.reasons,"
            " a.name AS activity_name, a.starts_at AS activity_starts_at,"
            " p.name AS participant_name, p.email AS participant_email,"
            " (SELECT att.checked_in_at FROM attendances att"
            "  WHERE att.activity_id = r.activity_id"
            "  AND att.user_id = r.user_id LIMIT 1) AS checked_in_at,"
            " (SELECT pay.status FROM payments pay"
            "  WHERE pay.registration_id = r.id"
            "  ORDER BY pay.updated_at DESC LIMIT 1) AS payment_status"
            + base
            + " ORDER BY COALESCE(a.starts_at, ''), r.id"
        )

        row_parameters = list(parameters)
        if limit is not None:
            sql += " LIMIT ? OFFSET ?"
            row_parameters.extend([limit, ((page or 1) - 1) * limit])

        rows = self._fetch_all(sql, row_parameters)
        return [_row_to_participant_dict(row) for row in rows], int(total)

    def last_event_at(self) -> str | None:
        row = self._fetch_one(
            "SELECT value FROM service_state WHERE key = 'lastEventAt'"
        )
        return row["value"] if row else None

    def last_message_type(self) -> str | None:
        row = self._fetch_one(
            "SELECT value FROM service_state WHERE key = 'lastMessageType'"
        )
        return row["value"] if row else None

    def healthcheck(self) -> bool:
        with self._lock:
            self._connection.execute("SELECT 1").fetchone()
        return True

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def _fetch_one(
        self, sql: str, parameters: Sequence[Any] = ()
    ) -> sqlite3.Row | None:
        with self._lock:
            return self._connection.execute(sql, parameters).fetchone()

    def _fetch_all(
        self, sql: str, parameters: Sequence[Any] = ()
    ) -> list[sqlite3.Row]:
        with self._lock:
            return self._connection.execute(sql, parameters).fetchall()


def _row_to_event(row: sqlite3.Row) -> Event:
    return Event(
        id=row["id"],
        name=row["name"],
        information=row["information"],
        start_date=row["start_date"],
        end_date=row["end_date"],
        status=row["status"],
        cancel_reason=row["cancel_reason"],
        organizers=tuple(_json_load(row["organizers"], [])),
        source_at=row["source_at"],
        updated_at=row["updated_at"],
        deleted_at=row["deleted_at"],
    )


def _row_to_activity(row: sqlite3.Row) -> Activity:
    return Activity(
        id=row["id"],
        event_id=row["event_id"],
        name=row["name"],
        description=row["description"],
        location=row["location"],
        starts_at=row["starts_at"],
        ends_at=row["ends_at"],
        capacity=row["capacity"],
        price_cents=row["price_cents"],
        rules=_json_tuple(row["rules"]),
        source_at=row["source_at"],
        updated_at=row["updated_at"],
        deleted_at=row["deleted_at"],
    )


def _row_to_registration(row: sqlite3.Row) -> Registration:
    return Registration(
        id=row["id"],
        event_id=row["event_id"],
        activity_id=row["activity_id"],
        user_id=row["user_id"],
        status=row["status"],
        requirements=_json_tuple(row["requirements"]),
        reasons=_json_tuple(row["reasons"]),
        source_at=row["source_at"],
        updated_at=row["updated_at"],
    )


def _row_to_attendance(row: sqlite3.Row) -> Attendance:
    return Attendance(
        activity_id=row["activity_id"],
        user_id=row["user_id"],
        event_id=row["event_id"],
        checked_in_at=row["checked_in_at"],
        source_at=row["source_at"],
    )


def _row_to_payment(row: sqlite3.Row) -> Payment:
    return Payment(
        id=row["id"],
        registration_id=row["registration_id"],
        user_id=row["user_id"],
        amount_cents=row["amount_cents"],
        status=row["status"],
        description=row["description"],
        reason=row["reason"],
        source_at=row["source_at"],
        updated_at=row["updated_at"],
    )


def _row_to_participant_dict(row: sqlite3.Row) -> dict:
    return {
        "registrationId": row["registration_id"],
        "userId": row["user_id"],
        "name": row["participant_name"],
        "email": row["participant_email"],
        "activityId": row["activity_id"],
        "activityName": row["activity_name"],
        "status": row["status"],
        "checkedInAt": row["checked_in_at"],
        "paymentStatus": row["payment_status"],
        "reasons": list(_json_load(row["reasons"], [])),
    }


_HANDLERS = {
    "EventCreated": ReportsRepository._apply_event_created,
    "EventUpdated": ReportsRepository._apply_event_updated,
    "EventPublished": ReportsRepository._apply_event_published,
    "EventCanceled": ReportsRepository._apply_event_canceled,
    "EventDeleted": ReportsRepository._apply_event_deleted,
    "ActivityCreated": ReportsRepository._apply_activity_created,
    "ActivityUpdated": ReportsRepository._apply_activity_updated,
    "ActivityDeleted": ReportsRepository._apply_activity_deleted,
    "RegistrationCreated": ReportsRepository._apply_registration_created,
    "RegistrationConfirmed": ReportsRepository._apply_registration_confirmed,
    "RegistrationPromoted": ReportsRepository._apply_registration_promoted,
    "RegistrationCanceled": ReportsRepository._apply_registration_canceled,
    "PaymentRequested": ReportsRepository._apply_payment_requested,
    "PaymentApproved": ReportsRepository._apply_payment_approved,
    "PaymentConfirmed": ReportsRepository._apply_payment_approved,
    "PaymentDenied": ReportsRepository._apply_payment_denied,
    "UserCheckedIn": ReportsRepository._apply_user_checked_in,
    "AttendanceRegistered": ReportsRepository._apply_user_checked_in,
    "UserRegistered": ReportsRepository._apply_user_created,
    "EventOrganizersChanged": ReportsRepository._apply_event_updated,
    "EventEnded": ReportsRepository._apply_event_updated,
    "UserCreated": ReportsRepository._apply_user_created,
    "UserUpdated": ReportsRepository._apply_user_updated,
}
