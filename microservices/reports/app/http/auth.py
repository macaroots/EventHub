from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import Request

from ..domain.errors import AppError, UnauthorizedError


@dataclass(frozen=True, slots=True)
class CurrentUser:
    id: str
    username: str | None = None
    role: str | None = None


async def get_current_user(request: Request) -> CurrentUser:
    """Authenticate via ``Authorization: Bearer <JWT>`` or the ``token`` cookie."""

    token = _bearer_token(request)
    if token is None:
        token = request.cookies.get("token")

    if not token:
        raise UnauthorizedError()

    secret = request.app.state.settings.jwt_secret
    if not secret:
        raise AppError("JWT_SECRET is not configured")

    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise UnauthorizedError("invalid token") from None

    user_id = payload.get("userId") or payload.get("sub") or payload.get("id")
    if not user_id:
        raise UnauthorizedError("invalid token")

    return CurrentUser(
        id=str(user_id),
        username=payload.get("username"),
        role=payload.get("role"),
    )


def _bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, value = header.partition(" ")
    if scheme.lower() != "bearer":
        return None
    return value.strip() or None
