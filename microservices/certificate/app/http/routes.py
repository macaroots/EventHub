from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from starlette.concurrency import run_in_threadpool

from ..application.certificate_service import CertificateService
from ..infrastructure.pdf_generator import PdfGenerator, certificate_filename
from .auth import CurrentUser, get_current_user
from .schemas import (
    CertificateCreatedOut,
    CertificateMetadataOut,
    CertificateSummaryOut,
    ErrorOut,
    PublicValidationOut,
)

_ERROR_RESPONSES = {
    401: {"description": "not authenticated"},
    403: {"description": "certificate belongs to another user"},
    404: {"description": "not found"},
}


def create_router(service: CertificateService, pdf_generator: PdfGenerator) -> APIRouter:
    router = APIRouter()

    @router.post(
        "/events/{event_id}/certificates",
        response_model=CertificateCreatedOut,
        status_code=200,
        responses={404: {"model": ErrorOut}},
        tags=["certificates"],
        summary="Consulta o certificado já emitido para o evento",
        description=(
            "A emissão é feita pelo consumidor de `CertificateRequested`. "
            "Esta rota apenas informa se o certificado já existe para o "
            "participante autenticado: `200` com o id ou `404` se ainda não "
            "foi emitido."
        ),
    )
    def certificate_for_event(
        event_id: str,
        user: CurrentUser = Depends(get_current_user),
    ) -> CertificateCreatedOut:
        certificate = service.get_for_event(user.id, event_id)
        return CertificateCreatedOut(certificateId=certificate.id)

    @router.get(
        "/certificates",
        response_model=list[CertificateSummaryOut],
        tags=["certificates"],
    )
    def list_certificates(
        user: CurrentUser = Depends(get_current_user),
    ) -> list[CertificateSummaryOut]:
        return [
            CertificateSummaryOut(
                certificateId=item["certificateId"],
                eventName=item["eventName"],
                eventDate=item["eventDate"],
            )
            for item in service.list_by_user(user.id)
        ]

    # Public route. Declared before /certificates/{certificate_id}/... so the
    # literal "validate" segment is never parsed as a certificate id.
    @router.get(
        "/certificates/validate/{verification_token}",
        response_model=PublicValidationOut,
        tags=["certificates"],
    )
    def validate_certificate(
        verification_token: str,
        response: Response,
    ) -> PublicValidationOut:
        response.headers["Cache-Control"] = "no-store"
        return PublicValidationOut(**service.validate(verification_token))

    @router.get(
        "/certificates/{certificate_id}/download",
        responses={
            200: {"content": {"application/pdf": {}}},
            **_ERROR_RESPONSES,
        },
        tags=["certificates"],
    )
    async def download_certificate(
        certificate_id: str,
        user: CurrentUser = Depends(get_current_user),
    ) -> Response:
        certificate = service.get_for_user(certificate_id, user)
        pdf = await run_in_threadpool(pdf_generator.generate, certificate)
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{certificate_filename(certificate)}"',
                "Cache-Control": "no-store",
            },
        )

    @router.get(
        "/certificates/{certificate_id}",
        response_model=CertificateMetadataOut,
        responses=_ERROR_RESPONSES,
        tags=["certificates"],
    )
    def certificate_metadata(
        certificate_id: str,
        user: CurrentUser = Depends(get_current_user),
    ) -> CertificateMetadataOut:
        return CertificateMetadataOut(**service.get_metadata(certificate_id, user))

    return router
