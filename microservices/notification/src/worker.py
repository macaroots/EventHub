import asyncio
import logging
from src.config import Settings
from src.application.notification_service import NotificationService
from src.infrastructure.database import NotificationRepository
from src.infrastructure.email_sender import EmailSender
from src.infrastructure.rabbitmq_bus import consume


async def run():
    settings = Settings()
    repository = NotificationRepository(settings.db_path)
    service = NotificationService(repository, EmailSender(settings), settings)

    async def delivery_loop():
        while True:
            if not await service.deliver_one():
                await asyncio.sleep(1)

    async with asyncio.TaskGroup() as tasks:
        tasks.create_task(consume(settings, repository))
        tasks.create_task(delivery_loop())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        pass
