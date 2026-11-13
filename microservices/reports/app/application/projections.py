from __future__ import annotations

from typing import Any

from ..domain.models import ApplyResult
from ..infrastructure.database import ReportsRepository
from .events import parse_event


class ProjectionService:
    """Applies domain events to the local read model."""

    def __init__(self, repository: ReportsRepository) -> None:
        self.repository = repository

    def apply(self, payload: Any) -> ApplyResult:
        event = parse_event(payload)
        result = self.repository.apply(event)
        if event.type == "EventPublished":
            raw = payload.get("data", payload)
            for activity in raw.get("activities", []):
                self.repository.apply(parse_event({"type": "ActivityCreated", "messageId": f"{event.message_id}:activity:{activity['activityId']}" if event.message_id else None, "occurredAt": event.occurred_at, "eventId": event.data["eventId"], **activity}))
        return result
