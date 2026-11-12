from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ErrorOut(BaseModel):
    error: str
    reasons: list[str] = Field(default_factory=list)


class EventSummaryOut(BaseModel):
    id: str
    name: str
    startDate: str | None = None
    endDate: str | None = None
    status: str
    cancelReason: str | None = None


class EventNameOut(BaseModel):
    id: str
    name: str


class RegistrationCountsOut(BaseModel):
    all: int
    active: int
    pending: int
    confirmed: int
    canceled: int


class PaymentSummaryOut(BaseModel):
    requested: int
    approved: int
    denied: int
    expectedAmount: float
    approvedAmount: float
    currency: str


class ParticipantOut(BaseModel):
    registrationId: str
    userId: str
    name: str | None = None
    email: str | None = None
    activityId: str | None = None
    activityName: str | None = None
    status: str
    checkedInAt: str | None = None
    paymentStatus: str | None = None
    reasons: list[Any] = Field(default_factory=list)


class EventTotalsOut(BaseModel):
    registrations: RegistrationCountsOut
    capacity: int
    occupancyRate: float | None = None
    attendanceRate: float | None = None
    noShowRate: float | None = None


class ActivityReportItemOut(BaseModel):
    id: str
    name: str
    location: str | None = None
    startsAt: str | None = None
    endsAt: str | None = None
    capacity: int
    price: float
    totalRegistrations: int
    totalRegistrationsConfirmed: int
    totalAttendances: int
    registrations: RegistrationCountsOut
    occupancyRate: float | None = None
    attendanceRate: float | None = None
    noShowRate: float | None = None


class EventReportOut(BaseModel):
    event: EventSummaryOut
    generatedAt: str
    dataUpdatedAt: str | None = None
    totalRegistrations: int
    totalRegistrationsConfirmed: int
    totalAttendances: int
    totals: EventTotalsOut
    payments: PaymentSummaryOut | None = None
    activities: list[ActivityReportItemOut] | None = None
    participants: list[ParticipantOut] | None = None


class ActivityDetailOut(BaseModel):
    id: str
    eventId: str
    name: str
    description: str | None = None
    location: str | None = None
    startsAt: str | None = None
    endsAt: str | None = None
    capacity: int
    price: float
    rules: list[Any] = Field(default_factory=list)


class ActivityReportOut(BaseModel):
    activity: ActivityDetailOut
    event: EventNameOut
    generatedAt: str
    dataUpdatedAt: str | None = None
    totalRegistrations: int
    totalRegistrationsConfirmed: int
    totalAttendances: int
    registrations: RegistrationCountsOut
    occupancyRate: float | None = None
    attendanceRate: float | None = None
    noShowRate: float | None = None
    participants: list[ParticipantOut] | None = None


class ParticipantsPageOut(BaseModel):
    items: list[ParticipantOut]
    page: int
    limit: int
    total: int
    dataUpdatedAt: str | None = None
