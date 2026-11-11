from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from src.domain.errors import InvalidStateError

class Payment:
    def __init__(
        self,
        id: str,
        registration_id: str,
        amount: float,
        user_id: Optional[str] = None,
        description: Optional[str] = None,
        status: str = "pending",
        receipt: Optional[str] = None,
        created_at: Optional[str] = None,
        expires_at: Optional[str] = None,
    ):
        if float(amount) <= 0:
            raise ValueError("O valor do pagamento deve ser maior que zero")
        self.id = id
        self.registration_id = registration_id
        self.amount = float(amount)
        self.user_id = user_id
        self.description = description
        self.status = status
        self.receipt = receipt
        self.created_at = created_at or datetime.now(timezone.utc).isoformat()
        self.expires_at = expires_at
        self._messages: List[Dict[str, Any]] = []

    def is_expired(self) -> bool:
        if not self.expires_at:
            return False
        try:
            exp = datetime.fromisoformat(self.expires_at.replace("Z", "+00:00"))
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            return datetime.now(timezone.utc) > exp
        except Exception:
            return False

    def pay(self, receipt: str) -> None:
        self._assert_pending()
        self.status = "paid"
        self.receipt = receipt
        self._messages.append({
            "type": "PaymentConfirmed",
            "paymentId": self.id,
            "registrationId": self.registration_id,
            "receipt": self.receipt,
            "userId": self.user_id,
        })

    def deny(self, reason: str = "payment denied") -> None:
        self._assert_pending()
        self.status = "denied"
        self._messages.append({
            "type": "PaymentDenied",
            "paymentId": self.id,
            "registrationId": self.registration_id,
            "reason": reason,
            "userId": self.user_id,
        })

    def expire(self) -> None:
        self._assert_pending()
        self.status = "expired"
        self._messages.append({
            "type": "PaymentExpired",
            "paymentId": self.id,
            "registrationId": self.registration_id,
            "reason": "payment expired",
            "userId": self.user_id,
        })

    def cancel(self) -> None:
        if self.status == "pending":
            self.status = "canceled"

    def _assert_pending(self) -> None:
        if self.status != "pending":
            raise InvalidStateError(f"Pagamento já está no estado '{self.status}'")

    def pull_messages(self) -> List[Dict[str, Any]]:
        messages = list(self._messages)
        self._messages.clear()
        return messages

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "registrationId": self.registration_id,
            "userId": self.user_id,
            "description": self.description,
            "amount": self.amount,
            "status": self.status,
            "receipt": self.receipt,
            "createdAt": self.created_at,
            "expiresAt": self.expires_at,
        }
