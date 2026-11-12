from __future__ import annotations

from io import BytesIO
from typing import Any, Iterable, Sequence

from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

from ...domain.models import ExportReport


def render_xlsx(report: ExportReport) -> bytes:
    workbook = Workbook()
    summary_sheet = workbook.active
    summary_sheet.title = "Resumo"
    _write_summary(summary_sheet, report)

    if report.activities:
        _write_table(
            workbook.create_sheet("Atividades"),
            [
                "Atividade",
                "Local",
                "Início",
                "Fim",
                "Capacidade",
                "Inscrições ativas",
                "Confirmadas",
                "Pendentes",
                "Canceladas",
                "Presenças",
                "Ocupação (%)",
                "Presença (%)",
                "Preço",
            ],
            [_activity_row(activity) for activity in report.activities],
        )

    if report.include_participants:
        _write_table(
            workbook.create_sheet("Participantes"),
            [
                "Inscrição",
                "Participante",
                "E-mail",
                "Atividade",
                "Status",
                "Check-in",
                "Pagamento",
            ],
            [_participant_row(participant) for participant in report.participants],
        )

    if report.include_payments:
        _write_table(
            workbook.create_sheet("Pagamentos"),
            ["Pagamento", "Descrição", "Status", "Valor", "Moeda"],
            [_payment_row(payment) for payment in report.payments],
        )

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _write_summary(sheet: Worksheet, report: ExportReport) -> None:
    registrations = report.summary.get("registrations") or {}
    payments = report.summary.get("payments") or {}
    currency = payments.get("currency") or ""

    rows: list[tuple[str, Any]] = [
        ("Evento", report.event.get("name")),
        ("Status", report.event.get("status")),
        ("Início", report.event.get("startDate")),
        ("Fim", report.event.get("endDate")),
        ("Gerado em", report.generated_at),
        ("Dados atualizados em", report.data_updated_at),
        ("Inscrições (todas)", registrations.get("all", 0)),
        ("Inscrições ativas", registrations.get("active", 0)),
        ("Inscrições pendentes", registrations.get("pending", 0)),
        ("Inscrições confirmadas", registrations.get("confirmed", 0)),
        ("Inscrições canceladas", registrations.get("canceled", 0)),
        ("Capacidade", report.summary.get("capacity", 0)),
        ("Ocupação (%)", report.summary.get("occupancyRate")),
        ("Presenças", report.summary.get("totalAttendances", 0)),
        ("Taxa de presença (%)", report.summary.get("attendanceRate")),
        ("Taxa de ausência (%)", report.summary.get("noShowRate")),
    ]

    if payments:
        rows.extend(
            [
                ("Pagamentos solicitados", payments.get("requested", 0)),
                ("Pagamentos aprovados", payments.get("approved", 0)),
                ("Pagamentos negados", payments.get("denied", 0)),
                ("Valor esperado", payments.get("expectedAmount")),
                ("Valor aprovado", payments.get("approvedAmount")),
                ("Moeda", currency),
            ]
        )

    _write_table(sheet, ["Indicador", "Valor"], rows)


def _write_table(
    sheet: Worksheet,
    header: Sequence[str],
    rows: Iterable[Sequence[Any]],
) -> None:
    sheet.append(list(header))
    for row in rows:
        sheet.append(list(row))

    for cell in sheet[1]:
        cell.font = Font(bold=True)

    sheet.freeze_panes = "A2"

    widths: dict[int, int] = {}
    for row in sheet.iter_rows(values_only=True):
        for index, value in enumerate(row, start=1):
            rendered = "" if value is None else str(value)
            widths[index] = max(widths.get(index, 0), len(rendered))
    for index, width in widths.items():
        sheet.column_dimensions[get_column_letter(index)].width = min(
            max(width + 2, 10), 60
        )


def _activity_row(activity: dict[str, Any]) -> list[Any]:
    counts = activity.get("registrations") or {}
    return [
        activity.get("name"),
        activity.get("location"),
        activity.get("startsAt"),
        activity.get("endsAt"),
        activity.get("capacity", 0),
        counts.get("active", activity.get("totalRegistrations", 0)),
        counts.get("confirmed", activity.get("totalRegistrationsConfirmed", 0)),
        counts.get("pending", 0),
        counts.get("canceled", 0),
        activity.get("totalAttendances", 0),
        activity.get("occupancyRate"),
        activity.get("attendanceRate"),
        activity.get("price"),
    ]


def _participant_row(participant: dict[str, Any]) -> list[Any]:
    return [
        participant.get("registrationId"),
        participant.get("name") or participant.get("userId"),
        participant.get("email"),
        participant.get("activityName") or participant.get("activityId"),
        participant.get("status"),
        participant.get("checkedInAt"),
        participant.get("paymentStatus"),
    ]


def _payment_row(payment: dict[str, Any]) -> list[Any]:
    return [
        payment.get("id"),
        payment.get("description"),
        payment.get("status"),
        payment.get("amount"),
        payment.get("currency"),
    ]
