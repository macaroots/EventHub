from __future__ import annotations

from typing import Any, Mapping
import asyncio

from ..domain.certificate import Certificate
from ..domain.errors import ForbiddenError, NotFoundError
from ..http.auth import CurrentUser
from ..infrastructure.database import CertificateRepository
from ..infrastructure.pdf_generator import PdfGenerator
from .events import parse_certificate_requested


class CertificateService:
    """Application service: issuance from events, queries and public validation.

    Emission is event-driven: :meth:`criar` consumes a ``CertificateRequested``
    published by the Credenciamento. There is no synchronous HTTP call to the
    ``registration`` service.
    """

    def __init__(
        self,
        repository: CertificateRepository,
        pdf_generator: PdfGenerator | None = None,
        event_publisher: Any = None,
    ) -> None:
        self.repository = repository
        self.pdf_generator = pdf_generator
        self.event_publisher = event_publisher
        self._publishing = asyncio.Lock()

    async def criar(self, evento: Mapping[str, Any]) -> tuple[Certificate, bool]:
        """Create the certificate for a ``CertificateRequested`` payload.

        Returns ``(certificate, created)``. Re-delivered messages and concurrent
        requests for the same ``(participantId, eventId)`` return the existing
        certificate and do not publish ``CertificateIssued`` again.
        """

        data = parse_certificate_requested(evento)

        certificate = Certificate(
            user_id=data.participant_id,
            event_id=data.event_id,
            participant_name=data.participant_name,
            event_name=data.event_name,
            event_date=data.event_date,
            activities=data.activities,
        )

        saved = self.repository.add_or_get(certificate)
        created = saved.id == certificate.id

        if self.event_publisher is not None:
            await self.flush_events()

        return saved, created

    async def flush_events(self) -> None:
        if self.event_publisher is None:
            return
        async with self._publishing:
            for event_id, event in self.repository.pending_events():
                try:
                    published = await self.event_publisher.publish(event)
                except Exception:
                    return
                if published is False:
                    return
                self.repository.mark_published(event_id)

    def get_for_event(self, user_id: str, event_id: str) -> Certificate:
        """Return the certificate already issued for ``(user, event)``.

        Used by ``POST /events/{eventId}/certificates`` as a readiness check.
        The certificate itself is created by :meth:`criar`, from the event.
        """

        certificate = self.repository.get_by_user_and_event(user_id, event_id)
        if certificate is None:
            raise NotFoundError("certificate not available")
        return certificate

    def list_by_user(self, user_id: str) -> list[dict]:
        return [
            {
                "certificateId": certificate.id,
                "eventName": certificate.event_name,
                "eventDate": certificate.event_date,
            }
            for certificate in self.repository.list_by_user(user_id)
        ]

    def get_metadata(self, certificate_id: str, user: CurrentUser) -> dict:
        return self._find_owned(certificate_id, user).to_metadata()

    def get_for_user(self, certificate_id: str, user: CurrentUser) -> Certificate:
        return self._find_owned(certificate_id, user)

    def validate(self, verification_token: str) -> dict:
        certificate = self.repository.get_by_token(verification_token)
        if certificate is None:
            raise NotFoundError("certificate not found")
        return certificate.to_public()

    def _find_owned(self, certificate_id: str, user: CurrentUser) -> Certificate:
        certificate = self.repository.get_by_id(certificate_id)
        if certificate is None:
            raise NotFoundError("certificate not found")
        if certificate.user_id != user.id and user.role != "admin":
            raise ForbiddenError("certificate belongs to another user")
        return certificate
