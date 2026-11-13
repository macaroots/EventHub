from datetime import datetime, timezone
from typing import Literal
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from src.api.auth import current_user
from src.domain.events import email_address

router = APIRouter()
NotificationType = Literal["PaymentRequested", "PaymentConfirmed", "PaymentDenied", "PaymentExpired", "PaymentCanceled", "RegistrationCreated", "RegistrationConfirmed", "RegistrationCanceled", "EventCanceledNotice", "CheckInOpened", "CertificateIssued", "CertificateDenied"]


@router.get("/health/live", tags=["Saúde"])
def live():
    return {"status": "ok"}


@router.get("/health/ready", tags=["Saúde"])
def ready(request: Request):
    if not request.app.state.repository.worker_ready():
        raise HTTPException(503, "Worker sem conexão recente com RabbitMQ")
    return {"status": "ready"}


@router.put("/contacts/me", tags=["Contato"], summary="Sincronizar nome e e-mail da própria conta pelo JWT")
def sync_contact(request: Request, user=Depends(current_user)):
    try:
        email = email_address(user.get("email"))
    except ValueError:
        raise HTTPException(422, "O token não contém um e-mail válido. Faça login novamente na identidade.")
    saved = request.app.state.repository.upsert_contact(user["userId"], email, user.get("name") or user.get("username"), datetime.now(timezone.utc).isoformat())
    if not saved:
        raise HTTPException(403, "Conta desativada para recebimento de notificações")
    return {"userId": user["userId"], "email": email, "status": "registered"}


@router.get("/notifications", tags=["Notificações"], summary="Consultar somente os avisos da conta autenticada")
def notifications(request: Request, user=Depends(current_user),
                  limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
                  kind: NotificationType | None = Query(None, alias="type"),
                  registration_id: str | None = Query(None, alias="registrationId", min_length=1, max_length=200)):
    items = request.app.state.repository.list_for_user(user["userId"], limit, offset, kind, registration_id)
    return {"items": items, "limit": limit, "offset": offset}


@router.post("/notifications/{notification_id}/retry", status_code=202, tags=["Notificações"])
def retry(notification_id: UUID, request: Request, user=Depends(current_user)):
    result = request.app.state.repository.retry(str(notification_id), user["userId"])
    if result == "not_found":
        raise HTTPException(404, "Notificação não encontrada")
    if result == "conflict":
        raise HTTPException(409, "Somente mensagens com falha ou aguardando contato podem ser tentadas novamente")
    return {"status": result}
