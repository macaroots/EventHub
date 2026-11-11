import pytest
from src.domain.payment import Payment
from src.domain.errors import InvalidStateError
from src.infrastructure.payment_repository import SQLitePaymentRepository
from src.application.payment_service import PaymentService
from src.api.auth import create_jwt_token, decode_jwt_token

class DummyMessageBus:
    def __init__(self):
        self.published = []

    async def publish(self, event):
        self.published.append(event)

@pytest.fixture
def clean_db(tmp_path, monkeypatch):
    test_db = str(tmp_path / "test_payments.db")
    monkeypatch.setattr("src.config.DB_PATH", test_db)
    from src.infrastructure.database import init_db
    init_db()
    return test_db

def test_payment_domain_transitions():
    p = Payment(id="pay-1", registration_id="reg-1", amount=50.0, user_id="usr-1")
    assert p.status == "pending"
    assert p.user_id == "usr-1"

    # Pagar
    p.pay(receipt="REC-123")
    assert p.status == "paid"
    assert p.receipt == "REC-123"

    events = p.pull_messages()
    assert len(events) == 1
    assert events[0]["type"] == "PaymentConfirmed"
    assert events[0]["paymentId"] == "pay-1"

    # Não deve permitir pagar novamente
    with pytest.raises(InvalidStateError):
        p.pay(receipt="REC-456")

@pytest.mark.asyncio
async def test_payment_service_charge_and_pay(clean_db):
    repo = SQLitePaymentRepository()
    bus = DummyMessageBus()
    service = PaymentService(repo, bus)

    # 1. Cobrar (PaymentRequested)
    await service.charge(payment_id="pay-10", registration_id="reg-20", amount=99.90, user_id="usr-gabriel")
    payment = service.get_payment("pay-10")
    assert payment.id == "pay-10"
    assert payment.amount == 99.90
    assert payment.user_id == "usr-gabriel"
    assert payment.status == "pending"

    # 2. Pagar com sucesso
    paid = await service.pay(payment_id="pay-10", receipt="REC-TESTE")
    assert paid.status == "paid"
    assert len(bus.published) == 1
    assert bus.published[0]["type"] == "PaymentConfirmed"

@pytest.mark.asyncio
async def test_payment_service_deny_simulation(clean_db):
    repo = SQLitePaymentRepository()
    bus = DummyMessageBus()
    service = PaymentService(repo, bus)

    await service.charge(payment_id="pay-20", registration_id="reg-30", amount=150.0)
    denied = await service.pay(payment_id="pay-20", simulate_status="denied")
    assert denied.status == "denied"
    assert len(bus.published) == 1
    assert bus.published[0]["type"] == "PaymentDenied"

@pytest.mark.asyncio
async def test_payment_service_expire(clean_db):
    repo = SQLitePaymentRepository()
    bus = DummyMessageBus()
    service = PaymentService(repo, bus)

    await service.charge(payment_id="pay-30", registration_id="reg-40", amount=30.0)
    expired = await service.expire(payment_id="pay-30")
    assert expired.status == "expired"
    assert len(bus.published) == 1
    assert bus.published[0]["type"] == "PaymentExpired"

@pytest.mark.asyncio
async def test_payment_cancel_by_registration(clean_db):
    repo = SQLitePaymentRepository()
    bus = DummyMessageBus()
    service = PaymentService(repo, bus)

    await service.charge(payment_id="pay-50", registration_id="reg-cancel", amount=10.0)
    service.cancel_by_registration("reg-cancel")

    p = service.get_payment("pay-50")
    assert p.status == "canceled"

def test_jwt_generation_and_decoding():
    token = create_jwt_token(user_id="usr-test", role="admin")
    decoded = decode_jwt_token(token)
    assert decoded["userId"] == "usr-test"
    assert decoded["role"] == "admin"
