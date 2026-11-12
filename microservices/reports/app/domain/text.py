from __future__ import annotations

import re
import unicodedata


def slugify(value: str | None, *, fallback: str = "relatorio") -> str:
    """ASCII, lowercase, hyphenated slug capped at 60 characters."""

    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_value).strip("-").lower()
    return slug[:60] or fallback
