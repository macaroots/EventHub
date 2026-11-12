from __future__ import annotations

from app.application.projections import ProjectionService
from app.infrastructure.database import ReportsRepository


def test_projection_survives_reopening_the_database(tmp_path) -> None:
    database_path = tmp_path / "reports.db"

    repository = ReportsRepository(str(database_path))
    try:
        ProjectionService(repository).apply(
            {
                "type": "EventCreated",
                "eventId": "event-1",
                "name": "Congresso",
                "messageId": "msg-1",
            }
        )
    finally:
        repository.close()

    reopened = ReportsRepository(str(database_path))
    try:
        event = reopened.get_event("event-1")
        assert event is not None
        assert event.name == "Congresso"
        assert reopened.last_message_type() == "EventCreated"

        duplicate = ProjectionService(reopened).apply(
            {
                "type": "EventCreated",
                "eventId": "event-1",
                "name": "Congresso",
                "messageId": "msg-1",
            }
        )
        assert duplicate.ignored is True
    finally:
        reopened.close()
