from __future__ import annotations

from io import BytesIO
from typing import Any, Sequence

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from ...domain.models import ExportReport
from .common import money_text, percent_text, text

_PAGE_WIDTH, _ = landscape(A4)


def render_pdf(report: ExportReport) -> bytes:
    buffer = BytesIO()
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        fontSize=16,
        leading=20,
        alignment=0,
        spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle",
        parent=styles["Normal"],
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#444444"),
    )
    section_style = ParagraphStyle(
        "ReportSection",
        parent=styles["Heading2"],
        fontSize=11,
        leading=14,
        spaceBefore=10,
        spaceAfter=4,
    )
    cell_style = ParagraphStyle(
        "ReportCell",
        parent=styles["Normal"],
        fontSize=8,
        leading=10,
    )
    header_style = ParagraphStyle(
        "ReportHeader",
        parent=cell_style,
        fontName="Helvetica-Bold",
        textColor=colors.white,
    )

    document = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=report.title,
        author="EventHub",
    )

    story: list[Any] = [
        Paragraph(_escape(report.title), title_style),
        Paragraph(_escape(_subtitle(report)), subtitle_style),
        Spacer(1, 8),
        Paragraph("Resumo", section_style),
        _summary_table(report, cell_style, header_style),
    ]

    if report.activities:
        story.extend(
            [
                Spacer(1, 6),
                Paragraph("Atividades", section_style),
                _activities_table(report, cell_style, header_style),
            ]
        )

    if report.include_participants:
        story.extend(
            [
                Spacer(1, 6),
                Paragraph("Participantes", section_style),
                _participants_table(report, cell_style, header_style),
            ]
        )

    if report.include_payments and report.payments:
        story.extend(
            [
                Spacer(1, 6),
                Paragraph("Pagamentos", section_style),
                _payments_table(report, cell_style, header_style),
            ]
        )

    def footer(canvas, doc) -> None:
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.HexColor("#666666"))
        canvas.drawString(
            18 * mm,
            10 * mm,
            f"Gerado em {report.generated_at}",
        )
        canvas.drawRightString(
            _PAGE_WIDTH - (18 * mm),
            10 * mm,
            f"Página {doc.page}",
        )
        canvas.restoreState()

    document.build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()


def _subtitle(report: ExportReport) -> str:
    event = report.event
    event_name = event.get("name") or event.get("id") or ""
    start = event.get("startDate") or ""
    end = event.get("endDate") or ""
    period = f"{start} a {end}" if start and end and start != end else start
    parts = [f"Evento: {event_name}"]
    if period:
        parts.append(f"Período: {period}")
    if report.data_updated_at:
        parts.append(f"Dados atualizados em: {report.data_updated_at}")
    return "  |  ".join(parts)


def _summary_table(report, cell_style, header_style) -> Table:
    registrations = report.summary.get("registrations") or {}
    payments = report.summary.get("payments") or {}

    rows: list[tuple[str, Any]] = [
        ("Inscrições (todas)", registrations.get("all", 0)),
        ("Inscrições ativas", registrations.get("active", 0)),
        ("Inscrições pendentes", registrations.get("pending", 0)),
        ("Inscrições confirmadas", registrations.get("confirmed", 0)),
        ("Inscrições canceladas", registrations.get("canceled", 0)),
        ("Capacidade", report.summary.get("capacity", 0)),
        ("Taxa de ocupação", percent_text(report.summary.get("occupancyRate")) or "-"),
        ("Presenças", report.summary.get("totalAttendances", 0)),
        ("Taxa de presença", percent_text(report.summary.get("attendanceRate")) or "-"),
        ("Taxa de ausência", percent_text(report.summary.get("noShowRate")) or "-"),
    ]

    if payments:
        currency = str(payments.get("currency") or "")
        rows.extend(
            [
                ("Pagamentos solicitados", payments.get("requested", 0)),
                ("Pagamentos aprovados", payments.get("approved", 0)),
                ("Pagamentos negados", payments.get("denied", 0)),
                (
                    "Valor esperado",
                    money_text(payments.get("expectedAmount"), currency),
                ),
                (
                    "Valor aprovado",
                    money_text(payments.get("approvedAmount"), currency),
                ),
            ]
        )

    data = [[_p("Indicador", header_style), _p("Valor", header_style)]]
    data.extend([_p(label, cell_style), _p(value, cell_style)] for label, value in rows)
    return _table(data, [250, 150], header_style)


def _activities_table(report, cell_style, header_style) -> Table:
    header = [
        "Atividade",
        "Local",
        "Início",
        "Fim",
        "Cap.",
        "Inscr.",
        "Conf.",
        "Pres.",
        "Ocup.",
        "Presença",
    ]
    data = [[_p(item, header_style) for item in header]]

    for activity in report.activities:
        counts = activity.get("registrations") or {}
        data.append(
            [
                _p(activity.get("name"), cell_style),
                _p(activity.get("location"), cell_style),
                _p(activity.get("startsAt"), cell_style),
                _p(activity.get("endsAt"), cell_style),
                _p(activity.get("capacity", 0), cell_style),
                _p(counts.get("active", activity.get("totalRegistrations", 0)), cell_style),
                _p(
                    counts.get(
                        "confirmed", activity.get("totalRegistrationsConfirmed", 0)
                    ),
                    cell_style,
                ),
                _p(activity.get("totalAttendances", 0), cell_style),
                _p(percent_text(activity.get("occupancyRate")) or "-", cell_style),
                _p(percent_text(activity.get("attendanceRate")) or "-", cell_style),
            ]
        )

    return _table(data, [135, 100, 85, 85, 40, 45, 45, 45, 55, 60], header_style)


def _participants_table(report, cell_style, header_style) -> Table:
    header = ["Participante", "E-mail", "Atividade", "Status", "Check-in", "Pagamento"]
    data = [[_p(item, header_style) for item in header]]

    for participant in report.participants:
        data.append(
            [
                _p(participant.get("name") or participant.get("userId"), cell_style),
                _p(participant.get("email"), cell_style),
                _p(
                    participant.get("activityName") or participant.get("activityId"),
                    cell_style,
                ),
                _p(participant.get("status"), cell_style),
                _p(participant.get("checkedInAt"), cell_style),
                _p(participant.get("paymentStatus"), cell_style),
            ]
        )

    return _table(data, [120, 150, 150, 70, 105, 80], header_style)


def _payments_table(report, cell_style, header_style) -> Table:
    header = ["Pagamento", "Descrição", "Status", "Valor", "Moeda"]
    data = [[_p(item, header_style) for item in header]]

    for payment in report.payments:
        data.append(
            [
                _p(payment.get("id"), cell_style),
                _p(payment.get("description"), cell_style),
                _p(payment.get("status"), cell_style),
                _p(f"{float(payment.get('amount') or 0):.2f}", cell_style),
                _p(payment.get("currency"), cell_style),
            ]
        )

    return _table(data, [110, 290, 80, 80, 50], header_style)


def _table(data, widths: Sequence[float], header_style) -> Table:
    table = Table(data, colWidths=list(widths), repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2f4f6f")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#b8c4d0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f7fa")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    return table


def _p(value: Any, style: ParagraphStyle) -> Paragraph:
    return Paragraph(_escape(text(value)) or "-", style)


def _escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\r", " ")
        .replace("\n", " ")
    )


__all__ = ["render_pdf"]
