import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

bearer = HTTPBearer(auto_error=False)


def current_user(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if credentials is None:
        raise HTTPException(401, "Informe o JWT da identidade no botão Authorize", headers={"WWW-Authenticate": "Bearer"})
    try:
        claims = jwt.decode(credentials.credentials, request.app.state.settings.jwt_secret,
            algorithms=["HS256"], options={"require": ["exp"]})
        user_id = claims.get("userId") or claims.get("sub")
        if not isinstance(user_id, str) or not user_id.strip():
            raise jwt.InvalidTokenError()
    except jwt.PyJWTError:
        raise HTTPException(401, "Token JWT inválido ou expirado", headers={"WWW-Authenticate": "Bearer"})
    return {**claims, "userId": user_id}
