import asyncio
import json
import logging
import aio_pika
from src.domain.events import EVENT_TYPES, Event

logger = logging.getLogger("notification.broker")
QUEUE = "notification.purchases.v1"


async def consume(settings, repository):
    while True:
        try:
            connection = await aio_pika.connect_robust(settings.rabbitmq_url, timeout=5)
            break
        except (OSError, asyncio.TimeoutError, aio_pika.exceptions.AMQPException):
            logger.warning("RabbitMQ indisponível; nova tentativa em 5 segundos")
            await asyncio.sleep(5)
    try:
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=10)
        exchange = await channel.declare_exchange("event-hub", aio_pika.ExchangeType.TOPIC, durable=True)
        await channel.declare_queue(QUEUE + ".dlq", durable=True)
        queue = await channel.declare_queue(QUEUE, durable=True, arguments={
            "x-dead-letter-exchange": "", "x-dead-letter-routing-key": QUEUE + ".dlq",
        })
        for kind in EVENT_TYPES:
            await queue.bind(exchange, routing_key=kind)

        async def handle(message):
            try:
                if len(message.body) > 1_000_000:
                    raise ValueError("Mensagem acima do limite")
                event = Event.parse(json.loads(message.body))
                repository.ingest(event)
            except (ValueError, TypeError, KeyError):
                logger.warning("Evento inválido encaminhado à DLQ message_id=%s", message.message_id)
                await message.reject(requeue=False)
            except Exception:
                logger.exception("Falha ao persistir evento; entrega será repetida")
                await asyncio.sleep(1)
                await message.nack(requeue=True)
            else:
                # ACK só após a transação SQLite; SMTP é processado separadamente.
                await message.ack()

        await queue.consume(handle)
        logger.info("Consumindo %s na exchange event-hub", QUEUE)
        while True:
            if connection.connected.is_set() and not channel.is_closed:
                repository.heartbeat()
            await asyncio.sleep(5)
    finally:
        await connection.close()
