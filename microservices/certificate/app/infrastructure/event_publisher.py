from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from uuid import uuid4
from typing import Any

logger = logging.getLogger(__name__)

_EXCHANGE = "event-hub"


class EventPublisher:
    """Publish certificate events; the service retries pending outbox entries."""

    def __init__(self, url: str | None = None) -> None:
        self.url = url
        self._connection: Any = None
        self._channel: Any = None
        self._exchange: Any = None

    async def connect(self) -> None:
        if not self.url:
            return

        try:
            import aio_pika

            self._connection = await aio_pika.connect_robust(self.url)
            self._channel = await self._connection.channel()
            self._exchange = await self._channel.declare_exchange(
                _EXCHANGE,
                aio_pika.ExchangeType.TOPIC,
                durable=True,
            )
        except Exception as exc:  # pragma: no cover - depends on external service
            logger.warning("RabbitMQ unavailable; CertificateIssued will be retried: %s", exc)
            self._connection = None
            self._channel = None
            self._exchange = None

    async def publish(self, event: dict) -> None:
        if self._exchange is None:
            await self.connect()
        if self._exchange is None:
            return False

        try:
            import aio_pika

            kind = event["type"]
            envelope = {"id": str(uuid4()), "type": kind, "source": "certificate", "time": datetime.now(timezone.utc).isoformat(), "data": {key: value for key, value in event.items() if key != "type"}}
            await self._exchange.publish(
                aio_pika.Message(
                    body=json.dumps(envelope).encode("utf-8"),
                    content_type="application/json",
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                ),
                routing_key=str(event.get("type", "")),
            )
        except Exception as exc:  # pragma: no cover - depends on external service
            logger.warning("CertificateIssued publish failed: %s", exc)
            return False
        return True

    async def close(self) -> None:
        if self._connection is not None:
            await self._connection.close()
        self._connection = None
        self._channel = None
        self._exchange = None
