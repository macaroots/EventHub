import json
from dataclasses import dataclass
from datetime import datetime, timezone
from email_validator import validate_email, EmailNotValidError

CONTACT_EVENTS = {"UserCreated", "UserRegistered", "UserUpdated", "UserDeactivated"}
PURCHASE_EVENTS = {"PaymentRequested", "PaymentConfirmed", "PaymentDenied", "PaymentExpired", "PaymentCanceled"}
REGISTRATION_EVENTS = {"RegistrationCreated", "RegistrationConfirmed", "RegistrationCanceled", "CheckInOpened", "CheckInClosed"}
CERTIFICATE_EVENTS = {"CertificateIssued", "CertificateDenied"}
EVENT_TYPES = CONTACT_EVENTS | PURCHASE_EVENTS | REGISTRATION_EVENTS | CERTIFICATE_EVENTS


def email_address(value):
    try:
        return validate_email(value, check_deliverability=False).normalized
    except (EmailNotValidError, TypeError) as exc:
        raise ValueError("E-mail inválido") from exc


@dataclass(frozen=True)
class Event:
    id: str
    type: str
    source: str
    time: str
    data: dict

    @classmethod
    def parse(cls, raw):
        if not isinstance(raw, dict) or not isinstance(raw.get("data"), dict):
            raise ValueError("Esperado envelope {id,type,source,time,data}")
        for field in ("id", "type", "source", "time"):
            if not isinstance(raw.get(field), str) or not raw[field].strip():
                raise ValueError(f"Envelope sem {field}")
        occurred = datetime.fromisoformat(raw["time"].replace("Z", "+00:00"))
        if occurred.tzinfo is None:
            raise ValueError("Horário do evento deve incluir fuso")
        kind, data = raw["type"], raw["data"]
        for field in ("userId", "registrationId", "paymentId", "id"):
            if data.get(field) is not None and (not isinstance(data[field], str) or not data[field].strip()):
                raise ValueError(f"Identificador inválido: {field}")
        if kind not in EVENT_TYPES:
            raise ValueError("Tipo de evento não suportado")
        expected_sources = ({"identity"} if kind in CONTACT_EVENTS else {"certificate"} if kind == "CertificateIssued" else {"registration"} if kind == "CertificateDenied" else {"payment", "registration"} if kind in PURCHASE_EVENTS else {"registration"})
        if raw["source"] not in expected_sources:
            raise ValueError("Origem incompatível com o evento")
        if kind in CERTIFICATE_EVENTS:
            owner = data.get("participantId") if kind == "CertificateIssued" else data.get("userId")
            required = ("eventId", "eventName", "activities") + (("certificateId",) if kind == "CertificateIssued" else ())
            if not isinstance(owner, str) or not owner.strip() or not all(data.get(k) for k in required):
                raise ValueError("Certificado sem dados obrigatórios")
            if not isinstance(data["activities"], list) or not all(isinstance(a, dict) and isinstance(a.get("name"), str) and a["name"].strip() for a in data["activities"]):
                raise ValueError("Atividades do certificado inválidas")
        if kind in CONTACT_EVENTS and not data.get("userId"):
            raise ValueError("Contato sem userId")
        if kind in PURCHASE_EVENTS and not data.get("registrationId"):
            raise ValueError("Pagamento sem registrationId")
        if kind == "RegistrationCreated" and not (data.get("id") and data.get("userId")):
            raise ValueError("Inscrição sem id ou userId")
        if kind in {"RegistrationConfirmed", "RegistrationCanceled"} and not data.get("registrationId"):
            raise ValueError("Inscrição sem registrationId")
        if kind == "CheckInOpened" and not all(data.get(key) for key in ("registrationId", "userId", "code", "openedAt")):
            raise ValueError("Check-in sem dados obrigatórios")
        if kind == "CheckInClosed" and not all(data.get(key) for key in ("registrationId", "userId", "closedAt")):
            raise ValueError("Fechamento de check-in sem dados obrigatórios")
        if kind in {"CheckInOpened", "CheckInClosed"}:
            date = datetime.fromisoformat(data["openedAt" if kind == "CheckInOpened" else "closedAt"].replace("Z", "+00:00"))
            if date.tzinfo is None: raise ValueError("Horário do check-in sem fuso")
        return cls(raw["id"], kind, raw["source"], occurred.astimezone(timezone.utc).isoformat(), data)

    @property
    def registration_id(self):
        return self.data.get("id") if self.type == "RegistrationCreated" else self.data.get("registrationId")

    @property
    def notification_type(self):
        if self.type == "RegistrationCanceled":
            reason = str(self.data.get("reason", "")).lower()
            if reason.startswith("event canceled:"):
                return "EventCanceledNotice"
            if "expir" in reason:
                return "PaymentExpired"
            if "payment denied" in reason:
                return "PaymentDenied"
        return self.type

    @property
    def dedup_key(self):
        # A mesma transição pode vir de pagamentos e inscrições com IDs diferentes.
        parts = ([self.type, self.data.get("certificateId")] if self.type == "CertificateIssued" else [self.type, self.data.get("eventId"), self.data.get("userId")] if self.type == "CertificateDenied" else [self.notification_type, self.registration_id])
        if self.type == "CheckInOpened": parts.append(self.data.get("openedAt"))
        return json.dumps(parts, ensure_ascii=False)
