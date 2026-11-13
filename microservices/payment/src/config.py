import os
from pathlib import Path

PORT = int(os.getenv("PORT", "3004"))
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
DB_PATH = os.getenv("DB_PATH", str(Path(__file__).resolve().parent.parent / "payments.db"))
PAYMENT_TIMEOUT_MINUTES = int(os.getenv("PAYMENT_TIMEOUT_MINUTES", "2"))
JWT_SECRET = os.getenv("JWT_SECRET", "eventhub-super-secret-key-production-uece-2026")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
