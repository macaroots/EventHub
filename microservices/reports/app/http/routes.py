from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response
from starlette.concurrency import run_in_threadpool

from ..application.reports_service import ReportsService
from ..infrastructure.exporters import MEDIA_TYPES, export_filename, render_export
from .auth import CurrentUser, get_current_user
from .schemas import (
    ActivityReportOut,
    ErrorOut,
    EventReportOut,
    ParticipantsPageOut,
)

_ERROR_RESPONSES = {
    400: {"model": ErrorOut, "description": "invalid format or filter"},
    401: {"model": ErrorOut, "description": "not authenticated"},
    403: {"model": ErrorOut, "description": "not an organizer or admin"},
    404: {"model": ErrorOut, "description": "event or activity not found"},
    413: {"model": ErrorOut, "description": "export above the row limit"},
}


def create_router(service: ReportsService) -> APIRouter:
    router = APIRouter()

    @router.get(
        "/reports/events/{event_id}",
        response_model=EventReportOut,
        response_model_exclude_unset=True,
        responses={
            200: {
                "content": {
                    "application/json": {},
                    "text/csv": {},
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {},
                    "application/pdf": {},
                }
            },
            **_ERROR_RESPONSES,
        },
        tags=["reports"],
        summary="Relatório consolidado do evento",
        description=(
            "Indicadores de inscrições, ocupação, comparecimento e pagamentos. "
            "`format=json` (padrão), `csv`, `xlsx` ou `pdf`."
        ),
    )
    async def event_report(
        event_id: str,
        response: Response,
        format: str | None = Query(default=None),
        include: str | None = Query(default=None),
        user: CurrentUser = Depends(get_current_user),
    ):
        fmt = service.parse_format(format)
        sections = service.parse_include(include)

        if fmt == "json":
            report = service.event_report(user, event_id, include=sections)
            _set_json_headers(response, report.get("dataUpdatedAt"))
            return report

        export = service.event_export(user, event_id, include=sections)
        return await _export_response(export, fmt)

    @router.get(
        "/reports/activities/{activity_id}",
        response_model=ActivityReportOut,
        response_model_exclude_unset=True,
        responses={
            200: {
                "content": {
                    "application/json": {},
                    "text/csv": {},
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {},
                    "application/pdf": {},
                }
            },
            **_ERROR_RESPONSES,
        },
        tags=["reports"],
        summary="Relatório consolidado da atividade",
        description=(
            "Indicadores da atividade e, com `include=participants`, a lista de "
            "inscritos. `format=json` (padrão), `csv`, `xlsx` ou `pdf`."
        ),
    )
    async def activity_report(
        activity_id: str,
        response: Response,
        format: str | None = Query(default=None),
        include: str | None = Query(default=None),
        user: CurrentUser = Depends(get_current_user),
    ):
        fmt = service.parse_format(format)
        sections = service.parse_include(include)

        if fmt == "json":
            report = service.activity_report(user, activity_id, include=sections)
            _set_json_headers(response, report.get("dataUpdatedAt"))
            return report

        export = service.activity_export(user, activity_id, include=sections)
        return await _export_response(export, fmt)

    @router.get(
        "/reports/events/{event_id}/participants",
        response_model=ParticipantsPageOut,
        response_model_exclude_unset=True,
        responses={
            200: {
                "content": {
                    "application/json": {},
                    "text/csv": {},
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {},
                    "application/pdf": {},
                }
            },
            **_ERROR_RESPONSES,
        },
        tags=["reports"],
        summary="Lista de presença / inscrições do evento",
        description=(
            "Filtros por `activityId`, `status` (CSV) e `checkedIn`. Em JSON a "
            "resposta é paginada; em CSV/XLSX/PDF exporta a lista filtrada."
        ),
    )
    async def event_participants(
        event_id: str,
        response: Response,
        format: str | None = Query(default=None),
        activity_id: str | None = Query(default=None, alias="activityId"),
        status: str | None = Query(default=None),
        checked_in: str | None = Query(default=None, alias="checkedIn"),
        page: int | None = Query(default=None),
        limit: int | None = Query(default=None),
        user: CurrentUser = Depends(get_current_user),
    ):
        fmt = service.parse_format(format)
        statuses = service.parse_statuses(status)
        checked = service.parse_checked_in(checked_in)

        if fmt == "json":
            current_page = service.parse_page(page)
            page_size = service.parse_limit(limit)
            payload, updated_at = service.participants_page(
                user,
                event_id,
                activity_id=activity_id,
                statuses=statuses,
                checked_in=checked,
                page=current_page,
                limit=page_size,
            )
            _set_json_headers(response, updated_at)
            return payload

        export = service.participants_export(
            user,
            event_id,
            activity_id=activity_id,
            statuses=statuses,
            checked_in=checked,
        )
        return await _export_response(export, fmt)

    return router


async def _export_response(export, fmt: str) -> Response:
    content = await run_in_threadpool(render_export, export, fmt)
    headers = {
        "Content-Disposition": f'attachment; filename="{export_filename(export, fmt)}"',
        "Cache-Control": "no-store",
    }
    if export.data_updated_at:
        headers["X-Report-Updated-At"] = export.data_updated_at
    return Response(
        content=content,
        media_type=MEDIA_TYPES[fmt],
        headers=headers,
    )


def _set_json_headers(response: Response, updated_at: str | None) -> None:
    response.headers["Cache-Control"] = "no-store"
    if updated_at:
        response.headers["X-Report-Updated-At"] = updated_at
