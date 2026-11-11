import sqlite3
from pathlib import Path
import src.config

def get_connection() -> sqlite3.Connection:
    Path(src.config.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(src.config.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db() -> None:
    with get_connection() as conn:
        conn.execute("CREATE TABLE IF NOT EXISTS payment_outbox (id TEXT PRIMARY KEY, payment_id TEXT NOT NULL, payload TEXT NOT NULL)")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS payments (
                id TEXT PRIMARY KEY,
                registration_id TEXT NOT NULL,
                user_id TEXT,
                description TEXT,
                amount REAL NOT NULL,
                status TEXT NOT NULL,
                receipt TEXT,
                created_at TEXT NOT NULL,
                expires_at TEXT
            )
            """
        )
        conn.commit()
