import asyncio
import logging
import time
from contextlib import suppress
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from src.config import PORT, RABBITMQ_URL
from src.infrastructure.database import init_db
from src.infrastructure.payment_repository import SQLitePaymentRepository
from src.infrastructure.rabbitmq_bus import RabbitMQBus
from src.application.payment_service import PaymentService
from src.api.routes import router as payment_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("payment_main")

payment_repository = SQLitePaymentRepository()
message_bus = RabbitMQBus(url=RABBITMQ_URL)
payment_service = PaymentService(payment_repository, message_bus)

# Registra os eventos ouvidos na Saga
message_bus.listen("PaymentRequested", payment_service.handle_payment_requested)
message_bus.listen("WaitingPayment", payment_service.handle_payment_requested)
message_bus.listen("RegistrationCanceled", payment_service.handle_registration_canceled)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Inicializando o banco SQLite do microsserviço de pagamento...")
    init_db()

    # Só aceita compras depois de vincular a fila aos eventos de inscrição.
    connected = await message_bus.connect()
    if not connected:
        raise RuntimeError("RabbitMQ indisponível: não é possível integrar inscrições e pagamentos")
    await message_bus.consume("payment")
    async def relay():
        while True:
            try:
                await payment_service.flush_events()
            except Exception:
                logger.exception("Falha no envio de eventos; nova tentativa no próximo ciclo")
            await asyncio.sleep(1)

    task = asyncio.create_task(relay())
    try:
        yield
    finally:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
        await message_bus.close()

app = FastAPI(
    title="EventHub Payment Service",
    description="Microsserviço em FastAPI responsável pelo ciclo de vida das transações financeiras (RF07, RN02, RN03) com JWT e suporte a RabbitMQ.",
    version="1.0.0",
    lifespan=lifespan,
    swagger_ui_parameters={"persistAuthorization": True},
)

# CORS permissivo para Swagger UI e chamadas locais
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Middleware de log para requisições da API
@app.middleware("http")
async def log_requests(request: Request, call_next):
    if request.url.path.startswith(("/docs", "/openapi.json", "/favicon.ico")):
        return await call_next(request)

    start_time = time.time()
    logger.info("➡️ %s %s", request.method, request.url.path)
    response = await call_next(request)
    duration_ms = round((time.time() - start_time) * 1000, 2)
    status_icon = "✅" if response.status_code < 400 else "❌"
    logger.info("%s Status: %s (%sms)", status_icon, response.status_code, duration_ms)
    return response

app.include_router(payment_router)

@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "service": "payment"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=PORT, reload=True)
