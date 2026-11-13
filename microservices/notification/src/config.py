import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Settings:
    jwt_secret: str = field(default_factory=lambda: os.getenv("JWT_SECRET", ""))
    db_path: str = field(default_factory=lambda: os.getenv("NOTIFICATION_DB_PATH", "notifications.db"))
    rabbitmq_url: str = field(default_factory=lambda: os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"))
    email_mode: str = field(default_factory=lambda: os.getenv("EMAIL_MODE", "log"))
    smtp_host: str = field(default_factory=lambda: os.getenv("SMTP_HOST", "localhost"))
    smtp_port: int = field(default_factory=lambda: int(os.getenv("SMTP_PORT", "1025")))
    smtp_from: str = field(default_factory=lambda: os.getenv("SMTP_FROM", "no-reply@eventhub.test"))
    smtp_username: str = field(default_factory=lambda: os.getenv("SMTP_USERNAME", ""))
    smtp_password: str = field(default_factory=lambda: os.getenv("SMTP_PASSWORD", ""))
    smtp_starttls: bool = field(default_factory=lambda: os.getenv("SMTP_STARTTLS", "false").lower() == "true")
    smtp_ssl: bool = field(default_factory=lambda: os.getenv("SMTP_SSL", "false").lower() == "true")
    smtp_timeout: float = field(default_factory=lambda: float(os.getenv("SMTP_TIMEOUT_SECONDS", "10")))
    max_attempts: int = field(default_factory=lambda: int(os.getenv("MAX_EMAIL_ATTEMPTS", "5")))
    retry_base: float = field(default_factory=lambda: float(os.getenv("RETRY_BASE_SECONDS", "5")))
    contact_wait: float = field(default_factory=lambda: float(os.getenv("CONTACT_WAIT_SECONDS", "86400")))

    def __post_init__(self):
        if not self.jwt_secret:
            raise ValueError("Configure JWT_SECRET com o mesmo segredo da identidade")
        if self.email_mode not in {"log", "smtp"}:
            raise ValueError("EMAIL_MODE deve ser log ou smtp")
        if self.smtp_ssl and self.smtp_starttls:
            raise ValueError("Use SMTP_SSL ou SMTP_STARTTLS, não ambos")
        if min(self.smtp_timeout, self.max_attempts, self.retry_base, self.contact_wait) <= 0:
            raise ValueError("Tempos e limite de tentativas devem ser positivos")
