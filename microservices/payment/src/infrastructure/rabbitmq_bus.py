import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Callable, Dict, List, Any
import aio_pika
from aio_pika import Message, DeliveryMode, ExchangeType
from src.config import RABBITMQ_URL

logger = logging.getLogger("rabbitmq_bus")
EXCHANGE_NAME = "event-hub"

class RabbitMQBus:
    def __init__(self, url: str = RABBITMQ_URL):
        self.url = url
        self.connection: aio_pika.abc.AbstractConnection | None = None
        self.channel: aio_pika.abc.AbstractChannel | None = None
        self.exchange: aio_pika.abc.AbstractExchange | None = None
        self.listeners: Dict[str, List[Callable[[Dict[str, Any]], Any]]] = {}
        self.is_connected = False

    async def connect(self, max_attempts: int = 5, delay: float = 1.0) -> bool:
        for attempt in range(1, max_attempts + 1):
            try:
                self.connection = await aio_pika.connect_robust(self.url, timeout=3.0)
                self.channel = await self.connection.channel()
                self.exchange = await self.channel.declare_exchange(
                    EXCHANGE_NAME,
                    type=ExchangeType.TOPIC,
                    durable=True,
                )
                self.is_connected = True
                logger.info("Conectado ao RabbitMQ na exchange '%s' com sucesso!", EXCHANGE_NAME)
                return True
            except Exception as e:
                if attempt == max_attempts:
                    logger.warning("RabbitMQ offline. Microsserviço de pagamento em modo autônomo/Swagger: %s", e)
                    return False
                await asyncio.sleep(delay)
        return False

    def listen(self, event_type: str, callback: Callable[[Dict[str, Any]], Any]) -> None:
        if event_type not in self.listeners:
            self.listeners[event_type] = []
        self.listeners[event_type].append(callback)

    async def publish(self, event: Dict[str, Any]) -> None:
        event_type = event.get("type", "unknown")

        # Cria o envelope padrão do EventHub: { id, type, source, time, data }
        event_id = str(uuid.uuid4())
        timestamp = datetime.now(timezone.utc).isoformat()

        # Se os dados já vierem em event["data"], usa eles; senão, o evento todo é a data
        data_payload = event.get("data") if "data" in event else {k: v for k, v in event.items() if k != "type"}

        envelope = {
            "id": event_id,
            "type": event_type,
            "source": "payment",
            "time": timestamp,
            "data": data_payload,
        }

        if not self.exchange or not self.is_connected:
            raise RuntimeError("RabbitMQ indisponível: evento de pagamento não publicado")

        body = json.dumps(envelope).encode("utf-8")
        message = Message(
            body=body,
            message_id=event_id,
            app_id="payment",
            type=event_type,
            delivery_mode=DeliveryMode.PERSISTENT,
            content_type="application/json",
        )
        logger.info("EVENT [%s] id=%s: %s", event_type, event_id, envelope)
        await self.exchange.publish(message, routing_key=event_type)

    async def consume(self, queue_name: str = "payment") -> None:
        if not self.channel or not self.exchange or not self.is_connected:
            return

        queue = await self.channel.declare_queue(queue_name, durable=True)
        for event_type in self.listeners.keys():
            await queue.bind(self.exchange, routing_key=event_type)

        await self.channel.set_qos(prefetch_count=1)

        async def on_message(message: aio_pika.abc.AbstractIncomingMessage):
            async with message.process(requeue=True):
                try:
                    payload = json.loads(message.body.decode("utf-8"))
                    event_type = payload.get("type")
                    event_data = payload.get("data", payload)

                    callbacks = self.listeners.get(event_type, [])
                    for cb in callbacks:
                        res = cb(event_data)
                        if asyncio.iscoroutine(res):
                            await res
                except Exception as e:
                    logger.error("Erro ao processar mensagem na fila %s: %s", queue_name, e)
                    raise

        await queue.consume(on_message)
        logger.info("Consumindo fila '%s' para os eventos: %s", queue_name, list(self.listeners.keys()))

    async def close(self) -> None:
        if self.connection and not self.connection.is_closed:
            await self.connection.close()
