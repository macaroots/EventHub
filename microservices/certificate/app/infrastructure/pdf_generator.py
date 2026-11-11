from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from io import BytesIO

import qrcode
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as pdf_canvas

from ..domain.certificate import Certificate

_PAGE_WIDTH, _PAGE_HEIGHT = landscape(A4)
_MARGIN = 50
_MAX_TEXT_WIDTH = _PAGE_WIDTH - (_MARGIN * 2)


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_value).strip("-").lower()
    return slug[:60]


def certificate_filename(certificate: Certificate) -> str:
    event = slugify(certificate.event_name) or "evento"
    participant = slugify(certificate.participant_name) or "participante"
    return f"certificado-{event}-{participant}.pdf"


def _format_date(iso_date: str) -> str:
    try:
        year, month, day = iso_date.split("-")
        return f"{day}/{month}/{year}"
    except ValueError:
        return iso_date


def _format_datetime(iso_datetime: str) -> str:
    try:
        value = datetime.fromisoformat(iso_datetime.replace("Z", "+00:00"))
        return value.strftime("%d/%m/%Y %H:%M")
    except ValueError:
        return iso_datetime


def _wrap_text(pdf: pdf_canvas.Canvas, text: str, font: str, size: int, max_width: float) -> list[str]:
    words = text.split()
    if not words:
        return [""]

    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if pdf.stringWidth(candidate, font, size) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


class PdfGenerator:
    """Renders the certificate PDF on demand (nothing is persisted on disk)."""

    def __init__(self, public_base_url: str = "http://localhost:3005") -> None:
        self.public_base_url = public_base_url.rstrip("/")

    def validation_url(self, verification_token: str) -> str:
        return f"{self.public_base_url}/certificates/validate/{verification_token}"

    def generate(self, certificate: Certificate) -> bytes:
        buffer = BytesIO()
        pdf = pdf_canvas.Canvas(buffer, pagesize=(_PAGE_WIDTH, _PAGE_HEIGHT))
        pdf.setTitle(f"Certificado - {certificate.event_name}")
        pdf.setAuthor("EventHub")
        pdf.setSubject(f"Certificado de {certificate.participant_name}")

        self._draw_header(pdf)
        self._draw_body(pdf, certificate)

        validation_url = self.validation_url(certificate.verification_token)
        self._draw_validation(pdf, certificate, validation_url)
        self._draw_qr_code(pdf, validation_url)

        pdf.showPage()
        pdf.save()

        return buffer.getvalue()

    @staticmethod
    def _draw_header(pdf: pdf_canvas.Canvas) -> None:
        pdf.setFillColor(HexColor("#1f2937"))
        pdf.setFont("Helvetica-Bold", 34)
        pdf.drawCentredString(_PAGE_WIDTH / 2, 500, "CERTIFICADO")

        pdf.setStrokeColor(HexColor("#2563eb"))
        pdf.setLineWidth(2)
        pdf.line(_PAGE_WIDTH / 2 - 70, 482, _PAGE_WIDTH / 2 + 70, 482)

    def _draw_body(self, pdf: pdf_canvas.Canvas, certificate: Certificate) -> None:
        pdf.setFillColor(HexColor("#374151"))
        pdf.setFont("Helvetica", 16)
        pdf.drawCentredString(_PAGE_WIDTH / 2, 440, "Certificamos que")

        pdf.setFillColor(HexColor("#111827"))
        pdf.setFont("Helvetica-Bold", 28)
        participant_lines = _wrap_text(pdf, certificate.participant_name, "Helvetica-Bold", 28, _MAX_TEXT_WIDTH)
        y = 398
        for line in participant_lines:
            pdf.drawCentredString(_PAGE_WIDTH / 2, y, line)
            y -= 32

        pdf.setFillColor(HexColor("#374151"))
        pdf.setFont("Helvetica", 15)
        pdf.drawCentredString(_PAGE_WIDTH / 2, y - 8, "participou do evento")

        y -= 42
        pdf.setFillColor(HexColor("#111827"))
        pdf.setFont("Helvetica-Bold", 19)
        event_lines = _wrap_text(pdf, certificate.event_name, "Helvetica-Bold", 19, _MAX_TEXT_WIDTH)
        for line in event_lines:
            pdf.drawCentredString(_PAGE_WIDTH / 2, y, line)
            y -= 24

        pdf.setFillColor(HexColor("#374151"))
        pdf.setFont("Helvetica", 14)
        pdf.drawCentredString(
            _PAGE_WIDTH / 2,
            y - 2,
            f"realizado em {_format_date(certificate.event_date)}",
        )

        activities = "  •  ".join(activity["name"] for activity in certificate.activities)
        y -= 40
        pdf.setFillColor(HexColor("#111827"))
        pdf.setFont("Helvetica-Bold", 14)
        pdf.drawCentredString(_PAGE_WIDTH / 2, y, "Atividades:")

        pdf.setFillColor(HexColor("#374151"))
        pdf.setFont("Helvetica", 13)
        y -= 22
        for line in _wrap_text(pdf, activities, "Helvetica", 13, _MAX_TEXT_WIDTH):
            pdf.drawCentredString(_PAGE_WIDTH / 2, y, line)
            y -= 17

    def _draw_validation(
        self,
        pdf: pdf_canvas.Canvas,
        certificate: Certificate,
        validation_url: str,
    ) -> None:
        pdf.setFillColor(HexColor("#4b5563"))
        pdf.setFont("Helvetica", 11)
        pdf.drawCentredString(
            _PAGE_WIDTH / 2,
            188,
            "Este certificado pode ser validado publicamente pelo código e link abaixo.",
        )

        pdf.setFillColor(HexColor("#111827"))
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawCentredString(_PAGE_WIDTH / 2, 168, f"Código: {certificate.verification_token}")

        pdf.setFillColor(HexColor("#2563eb"))
        pdf.setFont("Helvetica", 10)
        pdf.drawCentredString(_PAGE_WIDTH / 2, 150, validation_url)

        pdf.setFillColor(HexColor("#6b7280"))
        pdf.setFont("Helvetica", 9)
        pdf.drawString(
            _MARGIN,
            58,
            f"Emitido em {_format_datetime(certificate.created_at)}",
        )

    @staticmethod
    def _draw_qr_code(pdf: pdf_canvas.Canvas, validation_url: str) -> None:
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=4,
            border=1,
        )
        qr.add_data(validation_url)
        qr.make(fit=True)

        image = qr.make_image(fill_color="black", back_color="white")
        image_buffer = BytesIO()
        image.save(image_buffer, format="PNG")
        image_buffer.seek(0)

        qr_size = 88
        pdf.drawImage(
            ImageReader(image_buffer),
            _PAGE_WIDTH - _MARGIN - qr_size,
            48,
            width=qr_size,
            height=qr_size,
            mask="auto",
        )
