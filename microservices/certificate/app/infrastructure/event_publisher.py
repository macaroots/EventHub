from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

logger = logging.getLogger(__name__)

EXCHANGE = "event-hub"
SOURCE = "certificate"


def to_envelope(message: dict) -> dict:
    """``{type, ...data}`` -> envelope ``{id, type, source, time, data}`` (contracts/README.md)."""

    data = {key: value for key, value in message.items() if key != "type"}
    time = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    return {"id": str(uuid4()), "type": message["type"], "source": SOURCE, "time": time, "data": data}


class EventPublisher:
    """Best-effort publisher for ``CertificateIssued``.

    Issuance only depends on consuming ``CertificateRequested``; publishing the
    result is optional. Same transport as the Node services: exchange
    ``event-hub``, envelope in the body and ``messageId``/``type``/``appId``
    equal to the envelope ``id``/``type``/``source``. Connection and publish failures are logged and ignored,
    exactly like the other services treat optional integrations.
    """

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
                EXCHANGE,
                aio_pika.ExchangeType.TOPIC,
                durable=True,
            )
        except Exception as exc:  # pragma: no cover - depends on external service
            logger.warning("RabbitMQ unavailable; CertificateIssued will not be published: %s", exc)
            self._connection = None
            self._channel = None
            self._exchange = None

    async def publish(self, event: dict) -> None:
        if self._exchange is None:
            return

        try:
            import aio_pika

            envelope = to_envelope(event)
            await self._exchange.publish(
                aio_pika.Message(
                    body=json.dumps(envelope).encode("utf-8"),
                    content_type="application/json",
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                    message_id=envelope["id"],
                    type=envelope["type"],
                    app_id=envelope["source"],
                ),
                routing_key=envelope["type"],
            )
        except Exception as exc:  # pragma: no cover - depends on external service
            logger.warning("CertificateIssued publish failed: %s", exc)

    async def close(self) -> None:
        if self._connection is not None:
            await self._connection.close()
        self._connection = None
        self._channel = None
        self._exchange = None
