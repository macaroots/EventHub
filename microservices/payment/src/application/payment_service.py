import uuid
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from src.domain.payment import Payment
from src.domain.errors import NotFoundError, InvalidStateError
from src.infrastructure.payment_repository import SQLitePaymentRepository
from src.infrastructure.rabbitmq_bus import RabbitMQBus
from src.config import PAYMENT_TIMEOUT_MINUTES

class PaymentService:
    def __init__(self, repository: SQLitePaymentRepository, message_bus: RabbitMQBus):
        self.repository = repository
        self.message_bus = message_bus
        self._publishing = asyncio.Lock()

    async def handle_payment_requested(self, data: dict) -> None:
        """Handler para PaymentRequested ou WaitingPayment do RabbitMQ. Idempotente."""
        payment_id = data.get("paymentId") or data.get("id")
        registration_id = data.get("registrationId") or data.get("idInscricao") or ""
        user_id = data.get("userId") or data.get("idUsuario")
        description = data.get("description")
        amount = data.get("amount") or data.get("valor") or 0.0
        deadline = data.get("deadline") or data.get("expiresAt")

        if payment_id:
            await self.charge(
                payment_id=payment_id,
                registration_id=registration_id,
                amount=amount,
                user_id=user_id,
                description=description,
                expires_at=deadline,
            )

    async def handle_registration_canceled(self, data: dict) -> None:
        """Handler para RegistrationCanceled do RabbitMQ."""
        registration_id = data.get("registrationId")
        if registration_id:
            self.cancel_by_registration(registration_id)

    def cancel_by_registration(self, registration_id: str) -> None:
        payments = self.repository.list_by_registration(registration_id)
        for payment in payments:
            payment.cancel()
            self.repository.update(payment)

    async def charge(
        self,
        payment_id: Optional[str] = None,
        registration_id: str = "",
        amount: float = 0.0,
        user_id: Optional[str] = None,
        description: Optional[str] = None,
        expires_at: Optional[str] = None,
    ) -> Payment:
        payment_id = payment_id or str(uuid.uuid4())
        existing = self.repository.find_by_id(payment_id)
        if existing:
            return existing

        # Valida se expires_at é uma data real ou se veio vazio / "string" do Swagger
        final_expires_at = None
        if expires_at and expires_at.strip().lower() not in ["string", "null", "none", ""]:
            try:
                datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
                final_expires_at = expires_at
            except Exception:
                pass

        if not final_expires_at:
            final_expires_at = (datetime.now(timezone.utc) + timedelta(minutes=PAYMENT_TIMEOUT_MINUTES)).isoformat()

        payment = Payment(
            id=payment_id,
            registration_id=registration_id,
            amount=amount,
            user_id=user_id,
            description=description,
            status="pending",
            expires_at=final_expires_at,
        )
        self.repository.save(payment)
        return payment

    async def pay(
        self,
        payment_id: str,
        receipt: Optional[str] = None,
        simulate_status: str = "success",
    ) -> Payment:
        payment = self.repository.find_by_id(payment_id)
        if not payment:
            raise NotFoundError(f"Pagamento '{payment_id}'")

        if payment.is_expired():
            await self.expire(payment_id)
            raise InvalidStateError("O prazo para pagamento desta inscrição expirou. A vaga foi liberada.")

        # Simulação de recusa caso solicitado explicitamente ou receipt seja 'deny'
        if simulate_status == "denied" or receipt == "deny":
            payment.deny(reason="Cartão recusado pelo provedor de pagamento")
        else:
            final_receipt = receipt or f"REC-{uuid.uuid4().hex[:8].upper()}"
            payment.pay(final_receipt)

        self.repository.update(payment)
        await self._dispatch_events(payment)
        return payment

    async def expire(self, payment_id: str) -> Payment:
        payment = self.repository.find_by_id(payment_id)
        if not payment:
            raise NotFoundError(f"Pagamento '{payment_id}'")

        payment.expire()
        self.repository.update(payment)
        await self._dispatch_events(payment)
        return payment

    def get_payment(self, payment_id: str) -> Payment:
        payment = self.repository.find_by_id(payment_id)
        if not payment:
            raise NotFoundError(f"Pagamento '{payment_id}'")
        return payment

    def list_payments(
        self,
        registration_id: Optional[str] = None,
        user_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[Payment]:
        return self.repository.list_all(registration_id=registration_id, user_id=user_id, status=status)

    async def _dispatch_events(self, payment: Payment) -> None:
        await self.flush_events()

    async def flush_events(self) -> None:
        async with self._publishing:
            for event_id, message in self.repository.pending_events():
                await self.message_bus.publish(message)
                self.repository.mark_published(event_id)
