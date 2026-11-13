"""Publica um contato e UM aviso de compra para teste, sem simular a compra real."""
import argparse
import asyncio
import json
import os
import uuid
from datetime import datetime, timezone
import aio_pika
from src.domain.events import email_address

SCENARIOS = {
    "pending": ("PaymentRequested", "registration"),
    "confirmed": ("PaymentConfirmed", "payment"),
    "denied": ("PaymentDenied", "payment"),
    "expired": ("PaymentExpired", "payment"),
    "canceled": ("RegistrationCanceled", "registration"),
}


async def run(args):
    user_id, registration_id = args.user_id or str(uuid.uuid4()), str(uuid.uuid4())
    connection = await aio_pika.connect_robust(os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"))
    async with connection:
        channel = await connection.channel(publisher_confirms=True)
        exchange = await channel.declare_exchange("event-hub", aio_pika.ExchangeType.TOPIC, durable=True)

        async def publish(kind, source, data):
            envelope = dict(id=str(uuid.uuid4()), type=kind, source=source,
                time=datetime.now(timezone.utc).isoformat(), data=data)
            await exchange.publish(aio_pika.Message(body=json.dumps(envelope).encode(),
                message_id=envelope["id"], content_type="application/json", delivery_mode=aio_pika.DeliveryMode.PERSISTENT), routing_key=kind)

        await publish("UserRegistered", "identity", {"userId": user_id, "name": args.name, "email": email_address(args.email)})
        kind, source = SCENARIOS[args.scenario]
        await publish(kind, source, {"userId": user_id, "registrationId": registration_id,
            "paymentId": str(uuid.uuid4()), "amount": 100, "description": "Inscrição de demonstração",
            "receipt": "REC-DEMO", "reason": {"denied": "Cartão recusado pelo provedor", "expired": "Payment expired", "canceled": "Canceled by participant"}.get(args.scenario, "")})
    print(f"Evento {kind} publicado. userId={user_id} registrationId={registration_id}")
    print("Confira o terminal do worker (log) ou a caixa SMTP configurada. Nenhuma compra real foi criada.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", choices=SCENARIOS, default="confirmed")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="Participante de teste")
    parser.add_argument("--user-id", help="Opcional: userId da conta cujo histórico será consultado")
    asyncio.run(run(parser.parse_args()))
