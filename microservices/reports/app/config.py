from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _read_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _read_list(name: str) -> tuple[str, ...]:
    value = os.getenv(name)
    if not value:
        return ()
    return tuple(item.strip() for item in value.split(",") if item.strip())


@dataclass(frozen=True, slots=True)
class Settings:
    """Runtime configuration, loaded from environment variables."""

    port: int = 3006
    data_dir: str = "data"
    jwt_secret: str | None = None
    rabbitmq_url: str | None = None
    exchange: str = "loja"
    queue: str = "reports"
    currency: str = "BRL"
    max_export_rows: int = 10000
    admin_user_ids: tuple[str, ...] = ()

    @property
    def database_path(self) -> str:
        if self.data_dir == ":memory:":
            return ":memory:"
        return str(Path(self.data_dir) / "reports.db")

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            port=_read_int("PORT", 3006),
            data_dir=os.getenv("REPORTS_DATA_DIR") or os.getenv("DADOS") or "data",
            jwt_secret=os.getenv("JWT_SECRET"),
            rabbitmq_url=os.getenv("RABBITMQ_URL") or None,
            exchange=os.getenv("REPORTS_EXCHANGE", "loja"),
            queue=os.getenv("REPORTS_QUEUE", "reports"),
            currency=os.getenv("REPORTS_CURRENCY", "BRL"),
            max_export_rows=_read_int("REPORTS_MAX_EXPORT_ROWS", 10000),
            admin_user_ids=_read_list("REPORTS_ADMIN_USER_IDS"),
        )
