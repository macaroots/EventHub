from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from ..application.events import EVENT_TYPES
from ..application.projections import ProjectionService
from ..domain.errors import BadRequestError

logger = logging.getLogger(__name__)

EXCHANGE = "event-hub"
QUEUE = "reports"


class ReportsConsumer:
    """Consumes the domain events that feed the reports read model.

    Same conventions as the other EventHub consumers: topic exchange ``event-hub``,
    durable queue named after the service, ``prefetch(1)`` and persistent
    messages.

    Failure policy:

    * malformed JSON or invalid payload -> ``nack(requeue=False)`` (poison)
    * unexpected errors (database, lock) -> ``nack(requeue=True)`` (retry)
    * success or an unknown event type -> ``ack()``
    """

    def __init__(
        self,
        url: str | None,
        service: ProjectionService,
        *,
        exchange: str = EXCHANGE,
        queue: str = QUEUE,
        routing_keys: tuple[str, ...] | None = None,
    ) -> None:
        self.url = url
        self.service = service
        self.exchange_name = exchange
        self.queue_name = queue
        self.routing_keys = routing_keys or EVENT_TYPES

        self.connected = False
        self._connection: Any = None
        self._channel: Any = None
        self._task: asyncio.Task | None = None
        self._stopping: asyncio.Event | None = None

    async def start(self) -> None:
        if not self.url or self._task is not None:
            return

        self._stopping = asyncio.Event()
        self._task = asyncio.create_task(self._run(), name="reports-consumer")

    async def _run(self) -> None:
        delay = 1

        while self._stopping is not None and not self._stopping.is_set():
            try:
                await self._connect()
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # pragma: no cover - depends on broker
                self.connected = False
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
        for routing_key in self.routing_keys:
            await queue.bind(exchange, routing_key=routing_key)
        await queue.consume(self._handle)

        self.connected = True
        logger.info(
            "consuming %s events from queue %s on %s",
            len(self.routing_keys),
            self.queue_name,
            self.exchange_name,
        )

    async def _handle(self, message: Any) -> None:
        try:
            event = json.loads(message.body)
        except (ValueError, TypeError) as exc:
            logger.error("discarding malformed reports event: %s", exc)
            await message.nack(requeue=False)
            return

        event_type = _field(event, "type")
        try:
            result = self.service.apply(event)
        except BadRequestError as exc:
            logger.error(
                "discarding invalid %s (%s): %s",
                event_type,
                _field(event, "messageId"),
                exc.message,
            )
            await message.nack(requeue=False)
            return
        except Exception:  # pragma: no cover - depends on database
            logger.exception(
                "failed to project %s (%s); message will be retried",
                event_type,
                _field(event, "messageId"),
            )
            await message.nack(requeue=True)
            return

        logger.info(
            "projected type=%s applied=%s ignored=%s unknown=%s",
            result.event_type or event_type,
            result.applied,
            result.ignored,
            result.unknown,
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
