from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .application.projections import ProjectionService
from .application.reports_service import ReportsService
from .config import Settings
from .domain.errors import AppError
from .http.routes import create_router
from .infrastructure.bootstrap import bootstrap
from .infrastructure.consumer import ReportsConsumer
from .infrastructure.database import ReportsRepository

logger = logging.getLogger("reports")


def create_app(
    settings: Settings | None = None,
    *,
    repository: ReportsRepository | None = None,
    consumer: ReportsConsumer | None = None,
) -> FastAPI:
    settings = settings or Settings.from_env()

    owns_repository = repository is None
    repository = repository or ReportsRepository(settings.database_path)

    projections = ProjectionService(repository)
    service = ReportsService(repository, settings)

    owns_consumer = consumer is None
    event_consumer = consumer or ReportsConsumer(settings.rabbitmq_url, projections, exchange=settings.exchange, queue=settings.queue)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if os.getenv('REPORTS_BOOTSTRAP_EVENTS_DB'):
            bootstrap(projections, os.getenv('REPORTS_BOOTSTRAP_EVENTS_DB'), os.getenv('REPORTS_BOOTSTRAP_REGISTRATION_DB'), os.getenv('REPORTS_BOOTSTRAP_PAYMENT_DB'))
        if owns_consumer:
            await event_consumer.start()
        try:
            yield
        finally:
            if owns_consumer:
                await event_consumer.close()
            if owns_repository:
                repository.close()

    app = FastAPI(
        title="EventHub Reports",
        description=(
            "Monitoramento e relatórios por evento/atividade a partir de "
            "projeções locais alimentadas por eventos (CQRS)."
        ),
        version="1.0.0",
        lifespan=lifespan,
    )

    app.state.settings = settings
    app.state.repository = repository
    app.state.projections = projections
    app.state.consumer = event_consumer
    app.state.service = service

    app.include_router(create_router(service))

    @app.exception_handler(AppError)
    async def handle_app_error(_, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.to_dict())

    @app.get("/health", tags=["health"])
    def health() -> dict:
        try:
            repository.healthcheck()
            database = "ok"
        except Exception:  # pragma: no cover - defensive
            logger.exception("reports database healthcheck failed")
            database = "down"

        connected = bool(getattr(event_consumer, "connected", False))
        last_event_at = None
        last_message_type = None
        if database == "ok":
            try:
                last_event_at = repository.last_event_at()
                last_message_type = repository.last_message_type()
            except Exception:  # pragma: no cover - defensive
                logger.exception("reports state healthcheck failed")
                database = "down"

        degraded = database != "ok" or (
            settings.rabbitmq_url is not None and not connected
        )
        return {
            "status": "ok" if not degraded else "degraded",
            "database": database,
            "consumer": {
                "connected": connected,
                "queue": settings.queue,
                "exchange": settings.exchange,
                "lastEventAt": last_event_at,
                "lastMessageType": last_message_type,
            },
        }

    return app
