import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from src.domain.events import CERTIFICATE_EVENTS, CONTACT_EVENTS, email_address
from src.domain.templates import render


class NotificationRepository:
    def __init__(self, path):
        self.path = str(Path(path).resolve())
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS inbox (id TEXT PRIMARY KEY);
                CREATE TABLE IF NOT EXISTS contacts (
                    user_id TEXT PRIMARY KEY, email TEXT, name TEXT, active INTEGER NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS registrations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS notifications (
                    id TEXT PRIMARY KEY, dedup_key TEXT UNIQUE NOT NULL, event_type TEXT NOT NULL,
                    user_id TEXT, registration_id TEXT, subject TEXT NOT NULL, body TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL, next_attempt REAL NOT NULL, lease TEXT, lease_until REAL,
                    recipient TEXT, sent_at REAL, error TEXT
                );
                CREATE INDEX IF NOT EXISTS notification_due ON notifications(status,next_attempt);
                CREATE INDEX IF NOT EXISTS notification_owner ON notifications(user_id,created_at);
                CREATE TABLE IF NOT EXISTS checkin_versions (registration_id TEXT PRIMARY KEY, updated_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS worker_health (id INTEGER PRIMARY KEY, heartbeat REAL NOT NULL);
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def upsert_contact(self, user_id, email, name, updated_at, active=True):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT active FROM contacts WHERE user_id=?", (user_id,)).fetchone()
            if row and not row["active"]:
                return False
            self._contact(db, user_id, email, name, updated_at, active)
            return True

    @staticmethod
    def _contact(db, user_id, email, name, updated_at, active=True):
        db.execute("""INSERT INTO contacts VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
            email=coalesce(excluded.email,contacts.email), name=coalesce(excluded.name,contacts.name),
            active=excluded.active,updated_at=excluded.updated_at WHERE excluded.updated_at>=contacts.updated_at
        """, (user_id, email, name, int(active), updated_at))
        db.execute("UPDATE notifications SET next_attempt=? WHERE user_id=? AND status='waiting_contact'", (time.time(), user_id))

    def ingest(self, event):
        data = event.data
        now = time.time()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute("SELECT 1 FROM inbox WHERE id=?", (event.id,)).fetchone():
                return False
            if event.type in CONTACT_EVENTS:
                email = email_address(data["email"]) if data.get("email") else None
                # UserCreated legado não contém e-mail: espera cadastro autenticado do contato.
                if email or event.type == "UserDeactivated":
                    self._contact(db, data["userId"], email, data.get("name") or data.get("username"), event.time, event.type != "UserDeactivated")
            elif event.type in CERTIFICATE_EVENTS:
                user_id = data.get("participantId") if event.type == "CertificateIssued" else data["userId"]
                subject, body = render(event.type, data)
                db.execute("""INSERT OR IGNORE INTO notifications
                    (id,dedup_key,event_type,user_id,registration_id,subject,body,status,created_at,next_attempt)
                    VALUES(?,?,?,?,NULL,?,?,'pending',?,?)""", (str(uuid.uuid4()), event.dedup_key, event.type, user_id, subject, body, now, now))
            else:
                registration_id = event.registration_id
                user_id = data.get("userId")
                if user_id:
                    existing = db.execute("SELECT user_id FROM registrations WHERE id=?", (registration_id,)).fetchone()
                    if existing and existing["user_id"] != user_id:
                        raise ValueError("Evento com proprietário divergente para a inscrição")
                    db.execute("INSERT OR IGNORE INTO registrations VALUES(?,?)", (registration_id, user_id))
                    db.execute("UPDATE notifications SET user_id=? WHERE registration_id=? AND user_id IS NULL", (user_id, registration_id))
                else:
                    registration = db.execute("SELECT user_id FROM registrations WHERE id=?", (registration_id,)).fetchone()
                    user_id = registration["user_id"] if registration else None
                kind = event.notification_type
                if kind in {'CheckInOpened', 'CheckInClosed'}:
                    from datetime import datetime, timezone
                    value = data['openedAt' if kind == 'CheckInOpened' else 'closedAt']
                    timestamp = datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc).isoformat()
                    previous = db.execute('SELECT updated_at FROM checkin_versions WHERE registration_id=?', (registration_id,)).fetchone()
                    if previous and previous['updated_at'] >= timestamp:
                        db.execute('INSERT INTO inbox VALUES(?)', (event.id,))
                        return False
                    db.execute('INSERT OR REPLACE INTO checkin_versions VALUES(?,?)', (registration_id, timestamp))
                    db.execute("UPDATE notifications SET status='skipped' WHERE registration_id=? AND event_type='CheckInOpened' AND status IN ('pending','retry','waiting_contact')", (registration_id,))
                    if kind == 'CheckInClosed':
                        db.execute('INSERT INTO inbox VALUES(?)', (event.id,))
                        return True
                elif event.type == 'RegistrationCanceled':
                    db.execute("UPDATE notifications SET status='skipped' WHERE registration_id=? AND event_type='CheckInOpened' AND status IN ('pending','retry','waiting_contact')", (registration_id,))
                subject, body = render(kind, data)
                status = "pending"
                if kind == "PaymentRequested":
                    if db.execute("SELECT 1 FROM notifications WHERE registration_id=? AND event_type IN ('PaymentConfirmed','PaymentDenied','PaymentExpired','PaymentCanceled','RegistrationCanceled','EventCanceledNotice','RegistrationConfirmed')", (registration_id,)).fetchone():
                        status = "skipped"
                elif kind != "RegistrationCreated":
                    db.execute("UPDATE notifications SET status='skipped' WHERE registration_id=? AND event_type='PaymentRequested' AND status IN ('pending','retry','waiting_contact')", (registration_id,))
                db.execute("""INSERT OR IGNORE INTO notifications
                    (id,dedup_key,event_type,user_id,registration_id,subject,body,status,created_at,next_attempt)
                    VALUES(?,?,?,?,?,?,?,?,?,?)""", (str(uuid.uuid4()), event.dedup_key, kind, user_id, registration_id, subject, body, status, now, now))
            db.execute("INSERT INTO inbox VALUES(?)", (event.id,))
        return True

    def claim(self, lease_seconds):
        now, lease = time.time(), str(uuid.uuid4())
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("""SELECT * FROM notifications WHERE
                (status IN ('pending','retry','waiting_contact') AND next_attempt<=?)
                OR (status='sending' AND lease_until<=?) ORDER BY created_at LIMIT 1""", (now, now)).fetchone()
            if not row:
                return None
            db.execute("UPDATE notifications SET status='sending',lease=?,lease_until=? WHERE id=?", (lease, now + lease_seconds, row["id"]))
            contact = db.execute("SELECT * FROM contacts WHERE user_id=?", (row["user_id"],)).fetchone()
            return {**dict(row), "lease": lease, "contact": dict(contact) if contact else None}

    def finish(self, job, status, *, attempts=None, delay=0, error=None, recipient=None):
        with self.connect() as db:
            db.execute("""UPDATE notifications SET status=?,attempts=?,next_attempt=?,error=?,recipient=?,
                sent_at=?,lease=NULL,lease_until=NULL WHERE id=? AND lease=? AND status='sending'""",
                (status, job["attempts"] if attempts is None else attempts, time.time()+delay, error, recipient,
                 time.time() if status in {"sent", "logged"} else None, job["id"], job["lease"]))

    def list_for_user(self, user_id, limit=50, offset=0, kind=None, registration_id=None):
        with self.connect() as db:
            rows = db.execute("""SELECT id,event_type,user_id,registration_id,subject,body,status,attempts,
                created_at,recipient,sent_at FROM notifications WHERE user_id=? AND (? IS NULL OR event_type=?) AND (? IS NULL OR registration_id=?)
                ORDER BY created_at DESC,id LIMIT ? OFFSET ?""", (user_id, kind, kind, registration_id, registration_id, limit, offset)).fetchall()
            return [dict(row) for row in rows]

    def retry(self, notification_id, user_id):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT status FROM notifications WHERE id=? AND user_id=?", (notification_id, user_id)).fetchone()
            if not row:
                return "not_found"
            if row["status"] not in {"failed", "retry", "waiting_contact"}:
                return "conflict"
            db.execute("UPDATE notifications SET status='pending',attempts=0,next_attempt=?,error=NULL WHERE id=?", (time.time(), notification_id))
            return "pending"

    def heartbeat(self):
        with self.connect() as db:
            db.execute("INSERT OR REPLACE INTO worker_health VALUES(1,?)", (time.time(),))

    def worker_ready(self):
        with self.connect() as db:
            row = db.execute("SELECT heartbeat FROM worker_health WHERE id=1").fetchone()
            return bool(row and time.time()-row[0] < 45)
