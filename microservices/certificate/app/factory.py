from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .application.certificate_service import CertificateService
from .config import Settings
from .domain.errors import AppError
from .http.routes import create_router
from .infrastructure.consumer import CertificateRequestedConsumer
from .infrastructure.database import CertificateRepository
from .infrastructure.event_publisher import EventPublisher
from .infrastructure.pdf_generator import PdfGenerator

logger = logging.getLogger("certificate")


def create_app(
    settings: Settings | None = None,
    *,
    repository: CertificateRepository | None = None,
    pdf_generator: PdfGenerator | None = None,
    event_publisher: EventPublisher | None = None,
    consumer: CertificateRequestedConsumer | None = None,
) -> FastAPI:
    settings = settings or Settings.from_env()

    owns_repository = repository is None
    repository = repository or CertificateRepository(settings.database_path)
    pdf_generator = pdf_generator or PdfGenerator(settings.public_base_url)

    owns_publisher = event_publisher is None
    publisher = event_publisher if event_publisher is not None else EventPublisher(settings.rabbitmq_url)

    service = CertificateService(
        repository=repository,
        pdf_generator=pdf_generator,
        event_publisher=publisher,
    )

    owns_consumer = consumer is None
    event_consumer = consumer or CertificateRequestedConsumer(settings.rabbitmq_url, service)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if owns_publisher:
            await publisher.connect()
        if owns_consumer:
            await event_consumer.start()
        try:
            yield
        finally:
            if owns_consumer:
                await event_consumer.close()
            if owns_publisher:
                await publisher.close()
            if owns_repository:
                repository.close()

    app = FastAPI(
        title="EventHub Certificate",
        description="Emissão, consulta e validação pública de certificados.",
        version="2.0.0",
        lifespan=lifespan,
    )

    app.state.settings = settings
    app.state.repository = repository
    app.state.pdf_generator = pdf_generator
    app.state.event_publisher = publisher
    app.state.consumer = event_consumer
    app.state.service = service

    app.include_router(create_router(service, pdf_generator))

    @app.exception_handler(AppError)
    async def handle_app_error(_, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.to_dict())

    @app.get("/health", tags=["health"])
    def health() -> dict:
        try:
            repository.healthcheck()
            database = "ok"
        except Exception:  # pragma: no cover - defensive
            logger.exception("certificate database healthcheck failed")
            database = "down"
        return {"status": "ok" if database == "ok" else "degraded", "database": database}

    return app
