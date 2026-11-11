from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ActivityOut(BaseModel):
    name: str


class CertificateCreatedOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    certificate_id: str = Field(alias="certificateId")


class CertificateSummaryOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    certificate_id: str = Field(alias="certificateId")
    event_name: str = Field(alias="eventName")
    event_date: str = Field(alias="eventDate")


class CertificateMetadataOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    participant_name: str = Field(alias="participantName")
    event_name: str = Field(alias="eventName")
    event_date: str = Field(alias="eventDate")
    activities: list[ActivityOut]
    verification_token: str = Field(alias="verificationToken")
    issued_at: str = Field(alias="issuedAt")


class PublicValidationOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    valid: bool
    participant_name: str = Field(alias="participantName")
    event_name: str = Field(alias="eventName")
    event_date: str = Field(alias="eventDate")
    activities: list[ActivityOut]
    issued_at: str = Field(alias="issuedAt")


class ErrorOut(BaseModel):
    error: str
    reasons: list[str] | None = None
