"""Valida API, RabbitMQ e os cinco e-mails no Compose de teste (Mailpit)."""
import asyncio
import os
import time
import uuid
from argparse import Namespace
import httpx
import jwt
from dev.publish_purchase import SCENARIOS, run


async def main():
    user_id = str(uuid.uuid4())
    email = f"notification-{user_id}@example.com"
    secret = os.environ["JWT_SECRET"]
    os.environ.setdefault("RABBITMQ_URL", "amqp://guest:guest@localhost:5673/")
    token = jwt.encode({"userId": user_id, "email": email, "exp": time.time()+300}, secret, algorithm="HS256")
    async with httpx.AsyncClient(timeout=5) as client:
        for _ in range(30):
            if (await client.get("http://localhost:3006/health/ready")).is_success:
                break
            await asyncio.sleep(1)
        else:
            raise RuntimeError("Worker não ficou pronto")
        for scenario in SCENARIOS:
            await run(Namespace(user_id=user_id, email=email, name="Teste integrado", scenario=scenario))
        for _ in range(30):
            response = await client.get("http://localhost:3006/notifications", headers={"Authorization": "Bearer " + token})
            response.raise_for_status()
            rows = response.json()["items"]
            if len(rows) == 5 and all(row["status"] == "sent" for row in rows):
                break
            await asyncio.sleep(1)
        else:
            raise AssertionError("Os cinco avisos não foram enviados: " + str([(r["event_type"], r["status"]) for r in rows]))
        messages = (await client.get("http://localhost:8026/api/v1/messages")).json()["messages"]
        delivered = [message for message in messages if any(to["Address"] == email for to in message["To"])]
        assert len(delivered) == 5, "Mailpit não recebeu todos os avisos"
        assert {row["event_type"] for row in rows} == {"PaymentRequested", "PaymentConfirmed", "PaymentDenied", "PaymentExpired", "RegistrationCanceled"}
        print("OK: cinco eventos consumidos, cinco avisos no histórico autenticado e cinco e-mails capturados no Mailpit.")


if __name__ == "__main__":
    asyncio.run(main())
