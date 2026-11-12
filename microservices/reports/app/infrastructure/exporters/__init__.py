from __future__ import annotations

from ...domain.models import ExportReport
from .common import export_filename
from .csv_exporter import render_csv
from .pdf_exporter import render_pdf
from .xlsx_exporter import render_xlsx

_RENDERERS = {
    "csv": render_csv,
    "xlsx": render_xlsx,
    "pdf": render_pdf,
}

MEDIA_TYPES = {
    "csv": "text/csv; charset=utf-8",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pdf": "application/pdf",
}


def render_export(report: ExportReport, fmt: str) -> bytes:
    return _RENDERERS[fmt](report)


__all__ = ["MEDIA_TYPES", "export_filename", "render_export"]
