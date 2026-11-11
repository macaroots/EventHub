from __future__ import annotations

from app.domain.certificate import Certificate
from app.infrastructure.pdf_generator import PdfGenerator, certificate_filename

BASE = {
    "user_id": "user-1",
    "event_id": "event-1",
    "participant_name": "Maria Silva",
    "event_name": "Congresso X",
    "event_date": "2026-11-07",
    "activities": [{"name": "Minicurso A"}, {"name": "Palestra B"}],
}


def test_pdf_generator_produces_a_valid_pdf() -> None:
    certificate = Certificate(**BASE)

    pdf = PdfGenerator("http://localhost:3005").generate(certificate)

    assert pdf.startswith(b"%PDF")
    assert len(pdf) > 1000


def test_filename_is_ascii_and_safe() -> None:
    certificate = Certificate(
        **{
            **BASE,
            "participant_name": "José Ção",
            "event_name": "Congresso de Inovação 2026",
        }
    )

    assert certificate_filename(certificate) == (
        "certificado-congresso-de-inovacao-2026-jose-cao.pdf"
    )
