"""Publica a sequência de eventos de exemplo no RabbitMQ.

Uso (a partir de ``microservices/reports``):

    $env:RABBITMQ_URL="amqp://localhost"
    python dev/publish_events.py --event-id event-1

    # publica duas vezes para conferir a idempotência
    python dev/publish_events.py --event-id event-1 --repeat 2

O script declara o exchange, a fila durável e os bindings, então pode rodar
antes ou depois de o serviço estar no ar.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.application.events import EVENT_TYPES  # noqa: E402
from app.infrastructure.consumer import EXCHANGE, QUEUE  # noqa: E402
from dev.fixtures import build_events  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=os.getenv("RABBITMQ_URL") or "amqp://localhost")
    parser.add_argument("--event-id", default="event-1")
    parser.add_argument("--organizer", default="org-1")
    parser.add_argument("--exchange", default=EXCHANGE)
    parser.add_argument("--queue", default=QUEUE)
    parser.add_argument("--repeat", type=int, default=1)
    return parser


async def publish(args: argparse.Namespace) -> int:
    import aio_pika

    events = build_events(args.event_id, args.organizer)
    published = 0

    connection = await aio_pika.connect_robust(args.url)
    async with connection:
        channel = await connection.channel()
        exchange = await channel.declare_exchange(
            args.exchange,
            aio_pika.ExchangeType.TOPIC,
            durable=True,
        )
        queue = await channel.declare_queue(args.queue, durable=True)
        for routing_key in EVENT_TYPES:
            await queue.bind(exchange, routing_key=routing_key)

        for _ in range(max(args.repeat, 1)):
            for event in events:
                await exchange.publish(
                    aio_pika.Message(
                        body=json.dumps(event, ensure_ascii=False).encode("utf-8"),
                        delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                        content_type="application/json",
                        message_id=event.get("messageId"),
                    ),
                    routing_key=event["type"],
                )
                published += 1

    return published


def main() -> None:
    args = build_parser().parse_args()
    published = asyncio.run(publish(args))
    print(
        f"published {published} events to {args.exchange}/{args.queue} "
        f"for event {args.event_id}"
    )
    print(f"organizer token userId: {args.organizer}")


if __name__ == "__main__":
    main()
