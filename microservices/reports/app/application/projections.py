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
        return self.repository.apply(event)
