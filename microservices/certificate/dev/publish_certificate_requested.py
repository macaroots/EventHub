"""Publica um ``CertificateRequested`` para testar a emissão por evento.

O evento é o mesmo que o Credenciamento vai publicar quando implementar o
gatilho de emissão. Este script existe só para desenvolvimento.

Uso (a partir de ``microservices/certificate``):

    # com RabbitMQ, publicando no exchange/rota usados em produção
    $env:RABBITMQ_URL="amqp://localhost"
    python dev/publish_certificate_requested.py

    # publica duas vezes para conferir a idempotência
    python dev/publish_certificate_requested.py --repeat 2

    # sem RabbitMQ: chama o certificateService.criar direto no SQLite
    python dev/publish_certificate_requested.py --direct

Args principais: ``--participant-id``, ``--event-id``, ``--event-date``,
``--activity`` (pode repetir), ``--url``.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
from datetime import date

EXCHANGE = "event-hub"
QUEUE = "certificate"
ROUTING_KEY = "CertificateRequested"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default=os.getenv("RABBITMQ_URL") or "amqp://localhost")
    parser.add_argument("--participant-id", default="user-1")
    parser.add_argument("--participant-name", default="Maria Silva")
    parser.add_argument("--event-id", default="event-1")
    parser.add_argument("--event-name", default="Congresso X")
    parser.add_argument("--event-date", default=date.today().isoformat())
    parser.add_argument("--activity", action="append", dest="activities")
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument(
        "--direct",
        action="store_true",
        help="não usa RabbitMQ: chama CertificateService.criar no banco local",
    )
    return parser


def build_payload(args: argparse.Namespace) -> dict:
    return {
        "type": ROUTING_KEY,
        "participantId": args.participant_id,
        "participantName": args.participant_name,
        "eventId": args.event_id,
        "eventName": args.event_name,
        "eventDate": args.event_date,
        "activities": [{"name": name} for name in args.activities or ["Minicurso A", "Palestra B"]],
    }


async def publish(payload: dict, args: argparse.Namespace) -> None:
    import aio_pika

    connection = await aio_pika.connect_robust(args.url)
    try:
        channel = await connection.channel()
        exchange = await channel.declare_exchange(EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True)
        queue = await channel.declare_queue(QUEUE, durable=True)
        await queue.bind(exchange, routing_key=ROUTING_KEY)
        message = aio_pika.Message(
            body=json.dumps(payload).encode("utf-8"),
            content_type="application/json",
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        )
        for _ in range(max(args.repeat, 1)):
            await exchange.publish(message, routing_key=ROUTING_KEY)
    finally:
        await connection.close()


async def create_direct(payload: dict) -> None:
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

    from app.application.certificate_service import CertificateService
    from app.config import Settings
    from app.infrastructure.database import CertificateRepository

    settings = Settings.from_env()
    repository = CertificateRepository(settings.database_path)
    try:
        certificate, created = await CertificateService(repository).criar(payload)
        print(f"certificateId={certificate.id} created={created} db={settings.database_path}")
    finally:
        repository.close()


def main() -> None:
    args = build_parser().parse_args()
    payload = build_payload(args)
    print(json.dumps(payload, indent=2, ensure_ascii=False))

    if args.direct:
        asyncio.run(create_direct(payload))
        return

    asyncio.run(publish(payload, args))
    print(f"published {ROUTING_KEY} x{max(args.repeat, 1)} to {args.url}")


if __name__ == "__main__":
    main()
