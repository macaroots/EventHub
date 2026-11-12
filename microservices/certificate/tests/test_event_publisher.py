from __future__ import annotations

import json
import re
from pathlib import Path

from app.infrastructure.event_publisher import to_envelope

_SCHEMA = Path(__file__).resolve().parents[2] / "contracts" / "messages" / "CertificateIssued.schema.json"
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


def test_certificate_issued_follows_the_envelope_contract() -> None:
    schema = json.loads(_SCHEMA.read_text(encoding="utf-8"))
    data = {
        "certificateId": "c1",
        "participantId": "u1",
        "eventId": "e1",
        "verificationToken": "tok",
        "issuedAt": "2026-11-06T13:00:01.000Z",
    }

    message = to_envelope({"type": "CertificateIssued", **data})

    assert set(message) == {"id", "type", "source", "time", "data"}
    assert _UUID.match(message["id"])
    assert message["type"] == schema["properties"]["type"]["const"]
    assert message["source"] == schema["properties"]["source"]["const"]
    assert message["time"].endswith("Z")
    assert message["data"] == data
    assert set(schema["properties"]["data"]["required"]) <= set(message["data"])
