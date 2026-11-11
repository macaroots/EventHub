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


@dataclass(frozen=True, slots=True)
class Settings:
    """Runtime configuration, loaded from environment variables."""

    port: int = 3005
    data_dir: str = "data"
    jwt_secret: str | None = None
    public_base_url: str = "http://localhost:3005"
    rabbitmq_url: str | None = None

    @property
    def database_path(self) -> str:
        if self.data_dir == ":memory:":
            return ":memory:"
        return str(Path(self.data_dir) / "certificate.db")

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            port=_read_int("PORT", 3005),
            data_dir=os.getenv("CERTIFICATE_DATA_DIR") or os.getenv("DADOS") or "data",
            jwt_secret=os.getenv("JWT_SECRET"),
            public_base_url=os.getenv("PUBLIC_BASE_URL", "http://localhost:3005").rstrip("/"),
            rabbitmq_url=os.getenv("RABBITMQ_URL") or None,
        )
