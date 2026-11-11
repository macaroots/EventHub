from typing import Optional, List
from src.infrastructure.database import get_connection
from src.domain.payment import Payment
import json
import uuid

class SQLitePaymentRepository:
    def save(self, payment: Payment) -> None:
        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO payments (id, registration_id, user_id, description, amount, status, receipt, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    registration_id=excluded.registration_id,
                    user_id=excluded.user_id,
                    description=excluded.description,
                    amount=excluded.amount,
                    status=excluded.status,
                    receipt=excluded.receipt,
                    created_at=excluded.created_at,
                    expires_at=excluded.expires_at
                """,
                (
                    payment.id,
                    payment.registration_id,
                    payment.user_id,
                    payment.description,
                    payment.amount,
                    payment.status,
                    payment.receipt,
                    payment.created_at,
                    payment.expires_at,
                ),
            )
            for event in payment.pull_messages():
                event_id = str(uuid.uuid4())
                conn.execute("INSERT INTO payment_outbox (id, payment_id, payload) VALUES (?, ?, ?)",
                             (event_id, payment.id, json.dumps(event)))
            conn.commit()

    def pending_events(self, payment_id: Optional[str] = None):
        with get_connection() as conn:
            if payment_id is None:
                rows = conn.execute("SELECT id, payload FROM payment_outbox ORDER BY rowid").fetchall()
            else:
                rows = conn.execute("SELECT id, payload FROM payment_outbox WHERE payment_id = ? ORDER BY rowid", (payment_id,)).fetchall()
            return [(row["id"], json.loads(row["payload"])) for row in rows]

    def mark_published(self, event_id: str):
        with get_connection() as conn:
            conn.execute("DELETE FROM payment_outbox WHERE id = ?", (event_id,))
            conn.commit()

    def update(self, payment: Payment) -> None:
        self.save(payment)

    def find_by_id(self, payment_id: str) -> Optional[Payment]:
        with get_connection() as conn:
            cursor = conn.execute(
                "SELECT id, registration_id, user_id, description, amount, status, receipt, created_at, expires_at FROM payments WHERE id = ?",
                (payment_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return Payment(
                id=row["id"],
                registration_id=row["registration_id"],
                user_id=row["user_id"],
                description=row["description"],
                amount=row["amount"],
                status=row["status"],
                receipt=row["receipt"],
                created_at=row["created_at"],
                expires_at=row["expires_at"],
            )

    def list_by_registration(self, registration_id: str) -> List[Payment]:
        return self.list_all(registration_id=registration_id)

    def list_all(
        self,
        registration_id: Optional[str] = None,
        user_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[Payment]:
        query = "SELECT id, registration_id, user_id, description, amount, status, receipt, created_at, expires_at FROM payments WHERE 1=1"
        params = []

        if registration_id:
            query += " AND registration_id = ?"
            params.append(registration_id)
        if user_id:
            query += " AND user_id = ?"
            params.append(user_id)
        if status:
            query += " AND status = ?"
            params.append(status)

        query += " ORDER BY created_at DESC"

        with get_connection() as conn:
            cursor = conn.execute(query, tuple(params))
            rows = cursor.fetchall()
            return [
                Payment(
                    id=row["id"],
                    registration_id=row["registration_id"],
                    user_id=row["user_id"],
                    description=row["description"],
                    amount=row["amount"],
                    status=row["status"],
                    receipt=row["receipt"],
                    created_at=row["created_at"],
                    expires_at=row["expires_at"],
                )
                for row in rows
            ]
