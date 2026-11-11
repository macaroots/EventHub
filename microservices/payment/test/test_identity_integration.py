import os
import subprocess
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api.routes import router, get_payment_service
from src.application.payment_service import PaymentService
from src.infrastructure.payment_repository import SQLitePaymentRepository


class Bus:
    def __init__(self):
        self.events = []

    async def publish(self, event):
        self.events.append(event)


def identity_token(user_id):
    # Usa o emissor Node real de identidade, sem role e sem sub.
    from src.config import JWT_SECRET
    env = dict(os.environ, JWT_SECRET=JWT_SECRET, DATABASE_URL="postgresql://unused/test", INTERNAL_API_TOKEN="test")
    script = "import { JwtTokenService } from '../identity/src/infrastructure/token.js'; process.stdout.write(new JwtTokenService().sign({userId: process.argv[1], name: 'Ana Teste'}));"
    return subprocess.check_output(["node", "--input-type=module", "-e", script, user_id], cwd=Path(__file__).resolve().parents[1], env=env, text=True)


@pytest.mark.asyncio
async def test_identity_login_token_can_pay_only_own_registration(tmp_path, monkeypatch):
    monkeypatch.setattr("src.config.DB_PATH", str(tmp_path / "payments.db"))
    from src.infrastructure.database import init_db
    init_db()
    bus = Bus()
    service = PaymentService(SQLitePaymentRepository(), bus)
    await service.handle_payment_requested({"paymentId": "pay-1", "registrationId": "reg-1", "userId": "ana", "amount": 75})
    await service.handle_payment_requested({"paymentId": "pay-2", "registrationId": "reg-2", "userId": "outro", "amount": 40})
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_payment_service] = lambda: service
    with TestClient(app) as client:
        assert client.get("/payments/pay-1").status_code == 401
        assert client.get("/payments/pay-1", headers={"Authorization": "Bearer invalido"}).status_code == 401
        headers = {"Authorization": f"Bearer {identity_token('ana')}"}
        assert client.get("/payments/pay-1", headers=headers).status_code == 200
        assert client.post("/payments/pay-2/pay", headers=headers, json={"receipt": "REC-TEST"}).status_code == 403
        result = client.post("/payments/pay-1/pay", headers=headers, json={"receipt": "REC-TEST"})
        assert result.status_code == 200
        assert result.json()["status"] == "paid"
        assert result.json()["registrationId"] == "reg-1"
        assert bus.events == [{"type": "PaymentConfirmed", "paymentId": "pay-1", "registrationId": "reg-1", "receipt": "REC-TEST", "userId": "ana"}]
        assert [payment["id"] for payment in client.get("/payments", headers=headers).json()] == ["pay-1"]
        assert client.post("/payments/auth/token", json={"userId": "ana", "role": "admin"}).status_code == 404


@pytest.mark.asyncio
async def test_payment_event_survives_broker_failure(tmp_path, monkeypatch):
    monkeypatch.setattr("src.config.DB_PATH", str(tmp_path / "retry.db"))
    from src.infrastructure.database import init_db
    init_db()

    class OfflineBus:
        async def publish(self, event):
            raise ConnectionError("offline")

    repository = SQLitePaymentRepository()
    service = PaymentService(repository, OfflineBus())
    await service.charge(payment_id="pay-retry", registration_id="reg-retry", user_id="ana", amount=20)
    with pytest.raises(ConnectionError):
        await service.pay("pay-retry", receipt="REC-RETRY")
    assert repository.find_by_id("pay-retry").status == "paid"
    assert len(repository.pending_events()) == 1
    bus = Bus()
    await PaymentService(repository, bus).flush_events()
    assert bus.events[0]["type"] == "PaymentConfirmed"
    assert repository.pending_events() == []
