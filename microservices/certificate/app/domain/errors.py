from __future__ import annotations

from typing import Iterable


class AppError(Exception):
    """Base error that is safe to expose through the HTTP API."""

    status_code = 500

    def __init__(self, message: str = "internal server error", reasons: Iterable[str] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.reasons = list(reasons or [])

    def to_dict(self) -> dict:
        body: dict = {"error": self.message}
        if self.reasons:
            body["reasons"] = self.reasons
        return body


class BadRequestError(AppError):
    status_code = 400

    def __init__(self, message: str = "bad request", reasons: Iterable[str] | None = None) -> None:
        super().__init__(message, reasons)


class UnauthorizedError(AppError):
    status_code = 401

    def __init__(self, message: str = "unauthorized", reasons: Iterable[str] | None = None) -> None:
        super().__init__(message, reasons)


class ForbiddenError(AppError):
    status_code = 403

    def __init__(self, message: str = "forbidden", reasons: Iterable[str] | None = None) -> None:
        super().__init__(message, reasons)


class NotFoundError(AppError):
    status_code = 404

    def __init__(self, message: str = "not found", reasons: Iterable[str] | None = None) -> None:
        super().__init__(message, reasons)


class ConflictError(AppError):
    status_code = 409

    def __init__(self, message: str = "conflict", reasons: Iterable[str] | None = None) -> None:
        super().__init__(message, reasons)


class BadGatewayError(AppError):
    status_code = 502

    def __init__(self, message: str = "bad gateway", reasons: Iterable[str] | None = None) -> None:
        super().__init__(message, reasons)


class UnavailableError(AppError):
    status_code = 503

    def __init__(self, message: str = "service unavailable", reasons: Iterable[str] | None = None) -> None:
        super().__init__(message, reasons)
