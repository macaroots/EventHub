from contextlib import asynccontextmanager
from fastapi import FastAPI
from src.config import Settings
from src.infrastructure.database import NotificationRepository
from src.api.routes import router


def create_app(settings=None):
    @asynccontextmanager
    async def lifespan(app):
        app.state.settings = settings or Settings()
        app.state.repository = NotificationRepository(app.state.settings.db_path)
        yield

    app = FastAPI(title="EventHub — Notificações", version="0.1.0", lifespan=lifespan,
        description="Histórico de avisos da conta. Worker assíncrono separado; log local ou envio SMTP. Nenhuma rota pública permite disparar e-mails arbitrários.")
    app.include_router(router)
    return app
