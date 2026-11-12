from __future__ import annotations

from datetime import datetime

from ...domain.models import ExportReport
from ...domain.text import slugify

_PREFIX = {
    "event": "evento",
    "activity": "atividade",
    "participants": "participantes",
}


def export_filename(report: ExportReport, extension: str) -> str:
    prefix = _PREFIX.get(report.kind, "relatorio")
    generated = datetime.fromisoformat(report.generated_at.replace("Z", "+00:00"))
    return (
        f"relatorio-{prefix}-{slugify(report.slug)}-"
        f"{generated.strftime('%Y%m%d')}.{extension}"
    )


def percent_text(value: float | None) -> str:
    if value is None:
        return ""
    return f"{value:.2f}%"


def money_text(value: float | None, currency: str) -> str:
    if value is None:
        return ""
    return f"{value:.2f} {currency}"


def text(value: object) -> str:
    if value is None:
        return ""
    return str(value)
