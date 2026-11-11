from pydantic import BaseModel, Field
from typing import Optional, Literal

class CreatePaymentRequest(BaseModel):
    id: Optional[str] = Field(default=None, description="Identificador da cobrança (opcional, gerado automaticamente se omitido)")
    registrationId: str = Field(description="Identificador da inscrição associada")
    amount: float = Field(gt=0, description="Valor do pagamento em R$")
    userId: Optional[str] = Field(default=None, description="ID do participante (se omitido, extrai do token JWT logado)")
    description: Optional[str] = Field(default=None, description="Descrição do pagamento")
    expiresAt: Optional[str] = Field(default=None, description="Data limite de expiração ISO 8601 (opcional, padrão 15 min)")

class PayRequest(BaseModel):
    receipt: Optional[str] = Field(default=None, description="Código de comprovante (opcional, gerado automaticamente se omitido)")
    simulateStatus: Optional[Literal["success", "denied"]] = Field(default="success", description="Simulação de sucesso ou recusa bancária")

class PaymentResponse(BaseModel):
    id: str
    registrationId: str
    amount: float
    userId: Optional[str] = None
    description: Optional[str] = None
    status: Literal["pending", "paid", "denied", "expired", "canceled"]
    receipt: Optional[str] = None
    createdAt: Optional[str] = None
    expiresAt: Optional[str] = None

class TokenRequest(BaseModel):
    userId: str = Field(description="Identificador do usuário")
    role: Literal["participant", "admin"] = Field(default="participant", description="Perfil da conta")

class TokenResponse(BaseModel):
    token: str
    userId: str
    role: str
    expiresIn: str = "2h"

class ErrorResponse(BaseModel):
    detail: str
