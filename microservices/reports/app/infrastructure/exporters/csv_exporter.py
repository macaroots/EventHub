from __future__ import annotations

import csv
from io import StringIO
from typing import Any

from ...domain.models import ExportReport
from .common import percent_text

HEADER = [
    "secao",
    "id",
    "nome",
    "status",
    "inicio",
    "fim",
    "capacidade",
    "inscricoes_ativas",
    "confirmadas",
    "canceladas",
    "pendentes",
    "presencas",
    "taxa_ocupacao",
    "taxa_presenca",
    "valor",
]


def render_csv(report: ExportReport) -> bytes:
    buffer = StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(HEADER)

    registrations = report.summary.get("registrations") or {}
    writer.writerow(
        [
            "resumo",
            report.event.get("id"),
            report.event.get("name"),
            report.event.get("status"),
            report.event.get("startDate"),
            report.event.get("endDate"),
            report.summary.get("capacity", 0),
            registrations.get("active", 0),
            registrations.get("confirmed", 0),
            registrations.get("canceled", 0),
            registrations.get("pending", 0),
            report.summary.get("totalAttendances", 0),
            percent_text(report.summary.get("occupancyRate")),
            percent_text(report.summary.get("attendanceRate")),
            "",
        ]
    )

    for activity in report.activities:
        counts = activity.get("registrations") or {}
        writer.writerow(
            [
                "atividade",
                activity.get("id"),
                activity.get("name"),
                "",
                activity.get("startsAt"),
                activity.get("endsAt"),
                activity.get("capacity", 0),
                counts.get("active", activity.get("totalRegistrations", 0)),
                counts.get("confirmed", activity.get("totalRegistrationsConfirmed", 0)),
                counts.get("canceled", 0),
                counts.get("pending", 0),
                activity.get("totalAttendances", 0),
                percent_text(activity.get("occupancyRate")),
                percent_text(activity.get("attendanceRate")),
                f"{float(activity.get('price') or 0):.2f}",
            ]
        )

    for participant in report.participants:
        writer.writerow(_participant_row(participant))

    for payment in report.payments:
        writer.writerow(
            [
                "pagamento",
                payment.get("id"),
                payment.get("description"),
                payment.get("status"),
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                f"{float(payment.get('amount') or 0):.2f}",
            ]
        )

    return ("\ufeff" + buffer.getvalue()).encode("utf-8")


def _participant_row(participant: dict[str, Any]) -> list[Any]:
    return [
        "participante",
        participant.get("registrationId"),
        participant.get("name") or participant.get("userId"),
        participant.get("status"),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
    ]


__all__ = ["HEADER", "render_csv"]
