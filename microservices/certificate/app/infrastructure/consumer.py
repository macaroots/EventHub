from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from ..application.certificate_service import CertificateService
from ..domain.errors import BadRequestError

logger = logging.getLogger(__name__)

EXCHANGE = "loja"
QUEUE = "certificate"
ROUTING_KEY = "CertificateRequested"


class CertificateRequestedConsumer:
    """Consumes ``CertificateRequested`` from RabbitMQ and issues certificates.

    Same conventions as the Node services: topic exchange ``loja``, durable
    queue named after the service, ``prefetch(1)`` and persistent messages.

    Failure policy:

    * malformed JSON or invalid payload -> ``nack(requeue=False)`` (poison message)
    * unexpected errors (database, publisher) -> ``nack(requeue=True)`` (retry)
    * success -> ``ack()``
    """

    def __init__(
        self,
        url: str | None,
        service: CertificateService,
        *,
        exchange: str = EXCHANGE,
        queue: str = QUEUE,
        routing_key: str = ROUTING_KEY,
    ) -> None:
        self.url = url
        self.service = service
        self.exchange_name = exchange
        self.queue_name = queue
        self.routing_key = routing_key

        self.connected = False
        self._connection: Any = None
        self._channel: Any = None
        self._task: asyncio.Task | None = None
        self._stopping: asyncio.Event | None = None

    async def start(self) -> None:
        if not self.url or self._task is not None:
            return

        self._stopping = asyncio.Event()
        self._task = asyncio.create_task(self._run(), name="certificate-requested-consumer")

    async def _run(self) -> None:
        delay = 1

        while self._stopping is not None and not self._stopping.is_set():
            try:
                await self._connect()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # pragma: no cover - depends on external service
                logger.warning(
                    "RabbitMQ consumer unavailable (%s); retrying in %ss", exc, delay
                )
                try:
                    await asyncio.wait_for(self._stopping.wait(), timeout=delay)
                except asyncio.TimeoutError:
                    pass
                delay = min(delay * 2, 30)
                continue

            delay = 1
            await self._stopping.wait()

    async def _connect(self) -> None:
        import aio_pika

        self._connection = await aio_pika.connect_robust(self.url)
        self._channel = await self._connection.channel()
        await self._channel.set_qos(prefetch_count=1)

        exchange = await self._channel.declare_exchange(
            self.exchange_name,
            aio_pika.ExchangeType.TOPIC,
            durable=True,
        )
        queue = await self._channel.declare_queue(self.queue_name, durable=True)
        await queue.bind(exchange, routing_key=self.routing_key)
        await queue.consume(self._handle)

        self.connected = True
        logger.info(
            "consuming %s from queue %s on %s",
            self.routing_key,
            self.queue_name,
            self.exchange_name,
        )

    async def _handle(self, message: Any) -> None:
        try:
            event = json.loads(message.body)
        except (ValueError, TypeError) as exc:
            logger.error("discarding malformed CertificateRequested: %s", exc)
            await message.nack(requeue=False)
            return

        try:
            certificate, created = await self.service.criar(event)
        except BadRequestError as exc:
            logger.error(
                "discarding invalid CertificateRequested (eventId=%s, participantId=%s): %s",
                _field(event, "eventId"),
                _field(event, "participantId"),
                exc.message,
            )
            await message.nack(requeue=False)
            return
        except Exception:  # pragma: no cover - depends on external services
            logger.exception(
                "failed to process CertificateRequested (eventId=%s, participantId=%s);"
                " message will be retried",
                _field(event, "eventId"),
                _field(event, "participantId"),
            )
            await message.nack(requeue=True)
            return

        logger.info(
            "CertificateRequested processed certificateId=%s created=%s",
            certificate.id,
            created,
        )
        await message.ack()

    async def close(self) -> None:
        if self._stopping is not None:
            self._stopping.set()

        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            finally:
                self._task = None

        if self._connection is not None:
            await self._connection.close()

        self._connection = None
        self._channel = None
        self.connected = False


def _field(event: Any, name: str) -> str:
    if isinstance(event, dict):
        value = event.get(name)
        if value is not None:
            return str(value)
    return "-"
