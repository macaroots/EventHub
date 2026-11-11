from fastapi import APIRouter, HTTPException, Depends, Query, Response, status
from typing import List, Optional, Dict, Any
from src.api.schemas import (
    CreatePaymentRequest,
    PayRequest,
    PaymentResponse,
    TokenRequest,
    TokenResponse,
    ErrorResponse,
)
from src.api.auth import create_jwt_token, get_current_user
import os
from src.application.payment_service import PaymentService
from src.domain.errors import NotFoundError, InvalidStateError

router = APIRouter(prefix="/payments", tags=["Payments"])

def get_payment_service() -> PaymentService:
    from src.main import payment_service
    return payment_service

@router.post(
    "/auth/token",
    response_model=TokenResponse,
    summary="Gerar Token JWT para Teste (Participante ou Admin)",
)
def generate_token(body: TokenRequest, response: Response):
    if os.getenv("ALLOW_TEST_TOKENS", "false").lower() != "true":
        raise HTTPException(status_code=404, detail="Use o login do serviço de identidade")
    token = create_jwt_token(user_id=body.userId, role=body.role)
    # Define também no Cookie HTTP para o navegador usar automaticamente
    response.set_cookie(key="token", value=token, httponly=False, path="/")
    return {
        "token": token,
        "userId": body.userId,
        "role": body.role,
        "expiresIn": "2h",
    }

@router.post(
    "",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Criar Cobrança de Pagamento (Fazer a Compra)",
)
async def create_payment(
    body: CreatePaymentRequest,
    service: PaymentService = Depends(get_payment_service),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    # Se autenticado e não passou userId no body, vincula ao usuário autenticado
    if body.userId and body.userId != current_user["userId"]:
        raise HTTPException(status_code=403, detail="Usuário da cobrança diferente do usuário autenticado")
    final_user_id = current_user["userId"]

    payment = await service.charge(
        payment_id=body.id,
        registration_id=body.registrationId,
        amount=body.amount,
        user_id=final_user_id,
        description=body.description,
        expires_at=body.expiresAt,
    )
    return payment.to_dict()

@router.get(
    "/{payment_id}",
    response_model=PaymentResponse,
    responses={404: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
    summary="Consultar Cobrança Específica",
)
def get_payment(
    payment_id: str,
    service: PaymentService = Depends(get_payment_service),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    try:
        payment = service.get_payment(payment_id)

        # Regra de acesso: se tiver usuário logado e não for admin nem o dono da compra
        if current_user and current_user.get("role") != "admin" and payment.user_id:
            if payment.user_id != current_user.get("userId"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Você não tem permissão para acessar esta cobrança",
                )

        return payment.to_dict()
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.post(
    "/{payment_id}/pay",
    response_model=PaymentResponse,
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
    summary="Confirmar Pagamento (Sucesso ou Simulação de Recusa)",
)
async def process_payment(
    payment_id: str,
    body: PayRequest = PayRequest(),
    service: PaymentService = Depends(get_payment_service),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    try:
        payment = service.get_payment(payment_id)
        if payment.user_id != current_user["userId"]:
            raise HTTPException(status_code=403, detail="Você não tem permissão para pagar esta cobrança")
        payment = await service.pay(payment_id, receipt=body.receipt, simulate_status=body.simulateStatus)
        return payment.to_dict()
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except InvalidStateError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.post(
    "/{payment_id}/expire",
    response_model=PaymentResponse,
    responses={
        400: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
    summary="Expirar Cobrança por Timeout (RN02/RN03)",
)
async def expire_payment(payment_id: str, service: PaymentService = Depends(get_payment_service), current_user: Dict[str, Any] = Depends(get_current_user)):
    try:
        payment = service.get_payment(payment_id)
        if payment.user_id != current_user["userId"]:
            raise HTTPException(status_code=403, detail="Você não tem permissão para expirar esta cobrança")
        payment = await service.expire(payment_id)
        return payment.to_dict()
    except NotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except InvalidStateError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

@router.get(
    "",
    response_model=List[PaymentResponse],
    summary="Listar Cobranças (Participante vê as suas; Admin vê tudo)",
)
def list_payments(
    registrationId: Optional[str] = Query(None, description="Filtrar por inscrição"),
    userId: Optional[str] = Query(None, description="Filtrar por usuário (Admin)"),
    status: Optional[str] = Query(None, description="Filtrar por status"),
    service: PaymentService = Depends(get_payment_service),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    # Se for participante autenticado, restringe estritamente para o userId dele
    final_user_id = userId
    if current_user:
        if current_user.get("role") != "admin":
            final_user_id = current_user.get("userId")

    payments = service.list_payments(
        registration_id=registrationId,
        user_id=final_user_id,
        status=status,
    )
    return [p.to_dict() for p in payments]
