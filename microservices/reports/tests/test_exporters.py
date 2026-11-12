from __future__ import annotations

from io import BytesIO

from openpyxl import load_workbook

from app.application.reports_service import ReportsService
from app.domain.text import slugify
from app.infrastructure.exporters import (
    MEDIA_TYPES,
    export_filename,
    render_export,
)
from app.infrastructure.exporters.common import percent_text
from app.infrastructure.database import ReportsRepository
from tests.support import EVENT_ID, settings, user


def make_export(repository: ReportsRepository, include: set[str]):
    return ReportsService(repository, settings()).event_export(
        user(), EVENT_ID, include=include
    )


def test_slugify_removes_accents_and_symbols() -> None:
    assert slugify("Congresso de Tecnologia 2026") == "congresso-de-tecnologia-2026"
    assert slugify("Ação & Cia") == "acao-cia"
    assert slugify("") == "relatorio"
    assert percent_text(None) == ""
    assert percent_text(66.666) == "66.67%"


def test_csv_has_bom_header_and_sections(seeded: ReportsRepository) -> None:
    export = make_export(
        seeded, {"activities", "participants", "payments"}
    )

    content = render_export(export, "csv")

    assert content.startswith(b"\xef\xbb\xbf")
    decoded = content.decode("utf-8-sig")
    lines = decoded.splitlines()
    assert lines[0].startswith("secao,id,nome,status,inicio,fim")
    assert any(line.startswith("resumo,") for line in lines)
    assert any(line.startswith("atividade,") for line in lines)
    assert any(line.startswith("participante,") for line in lines)
    assert any(line.startswith("pagamento,") for line in lines)


def test_csv_respects_include_sections(seeded: ReportsRepository) -> None:
    export = make_export(seeded, {"activities"})

    decoded = render_export(export, "csv").decode("utf-8-sig")

    assert "participante," not in decoded
    assert "pagamento," not in decoded


def test_xlsx_has_expected_sheets(seeded: ReportsRepository) -> None:
    export = make_export(
        seeded, {"activities", "participants", "payments"}
    )

    content = render_export(export, "xlsx")

    assert content.startswith(b"PK")
    workbook = load_workbook(BytesIO(content))
    assert workbook.sheetnames == [
        "Resumo",
        "Atividades",
        "Participantes",
        "Pagamentos",
    ]
    summary = workbook["Resumo"]
    assert summary["A1"].value == "Indicador"
    assert summary["B1"].value == "Valor"
    assert summary["B1"].font.bold is True
    assert workbook["Atividades"].freeze_panes == "A2"


def test_xlsx_only_creates_requested_sheets(seeded: ReportsRepository) -> None:
    export = make_export(seeded, {"activities"})

    workbook = load_workbook(BytesIO(render_export(export, "xlsx")))

    assert workbook.sheetnames == ["Resumo", "Atividades"]


def test_pdf_is_a_valid_document(seeded: ReportsRepository) -> None:
    export = make_export(
        seeded, {"activities", "participants", "payments"}
    )

    content = render_export(export, "pdf")

    assert content.startswith(b"%PDF")
    assert content.rstrip().endswith(b"%%EOF")
    assert len(content) > 1000


def test_activity_and_participants_exports_get_specific_names(
    seeded: ReportsRepository,
) -> None:
    service = ReportsService(seeded, settings())

    activity = service.activity_export(user(), "event-1-act-1", include=set())
    participants = service.participants_export(
        user(),
        EVENT_ID,
        activity_id=None,
        statuses=None,
        checked_in=None,
    )

    assert export_filename(activity, "pdf").startswith(
        "relatorio-atividade-minicurso-de-fastapi-"
    )
    assert export_filename(activity, "pdf").endswith(".pdf")
    assert export_filename(participants, "csv").startswith(
        "relatorio-participantes-congresso-de-tecnologia-2026-"
    )
    assert MEDIA_TYPES["xlsx"].startswith(
        "application/vnd.openxmlformats-officedocument"
    )
