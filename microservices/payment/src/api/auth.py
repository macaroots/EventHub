from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any
import jwt
from fastapi import Request, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from src.config import JWT_SECRET, JWT_ALGORITHM

security_bearer = HTTPBearer(auto_error=False)

def create_jwt_token(user_id: str, role: str = "participant", expires_hours: int = 2) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "userId": user_id,
        "sub": user_id,
        "role": role,
        "iat": now,
        "exp": now + timedelta(hours=expires_hours),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_jwt_token(token: str) -> Dict[str, Any]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        # Compatibilidade universal: aceita 'sub' (Node.js) ou 'userId' (Swagger/Python)
        user_id = payload.get("userId") or payload.get("sub") or payload.get("id")
        role = payload.get("role", "participant")
        if role == "user":
            role = "participant"
        return {
            **payload,
            "userId": user_id,
            "role": role,
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token JWT expirado",
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token JWT inválido",
        )

async def get_optional_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
) -> Optional[Dict[str, Any]]:
    """Tenta extrair usuário do Header 'Authorization: Bearer' ou do Cookie 'token'."""
    token: Optional[str] = None

    # 1. Header via Bearer (Swagger UI Authorize)
    if credentials and credentials.credentials:
        token = credentials.credentials
    # 2. Cookie 'token' do navegador
    elif "token" in request.cookies:
        token = request.cookies.get("token")
    # 3. Fallback no header Authorization manual
    elif "Authorization" in request.headers:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]

    if not token:
        return None

    return decode_jwt_token(token)


async def get_current_user(
    user: Optional[Dict[str, Any]] = Depends(get_optional_current_user),
) -> Dict[str, Any]:
    if not user or not user.get("userId"):
        raise HTTPException(status_code=401, detail="Faça login no serviço de identidade")
    return user
