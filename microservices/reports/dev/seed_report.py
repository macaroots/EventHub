"""Popula o SQLite do ``reports`` diretamente, sem RabbitMQ.

Uso (a partir de ``microservices/reports``):

    python dev/seed_report.py --event-id event-1 --organizer org-1

O script aplica a mesma sequência de eventos que o publisher usa e é
idempotente: rodar duas vezes não altera os totais.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.application.projections import ProjectionService  # noqa: E402
from app.config import Settings  # noqa: E402
from app.infrastructure.database import ReportsRepository  # noqa: E402
from dev.fixtures import build_events  # noqa: E402


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event-id", default="event-1")
    parser.add_argument("--organizer", default="org-1")
    parser.add_argument("--data-dir", default=Settings.from_env().data_dir)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    database_path = (
        ":memory:"
        if args.data_dir == ":memory:"
        else str(Path(args.data_dir) / "reports.db")
    )

    repository = ReportsRepository(database_path)
    projections = ProjectionService(repository)

    applied = 0
    ignored = 0
    for event in build_events(args.event_id, args.organizer):
        result = projections.apply(event)
        if result.applied:
            applied += 1
        else:
            ignored += 1

    try:
        event = repository.get_event(args.event_id)
        registrations = repository.list_registrations(event_id=args.event_id)
        attendances = repository.list_attendances(event_id=args.event_id)
        print(f"database: {database_path}")
        print(f"event: {event.name if event else '(not found)'} ({args.event_id})")
        print(f"organizer: {args.organizer}")
        print(f"events applied={applied} ignored={ignored}")
        print(f"registrations: {len(registrations)}")
        print(f"attendances: {len(attendances)}")
        print("token example:")
        print(
            "  python -c \"import jwt; "
            "print(jwt.encode({'userId': '"
            f"{args.organizer}"
            "'}, 'dev-secret-com-pelo-menos-32-bytes', algorithm='HS256'))\""
        )
    finally:
        repository.close()


if __name__ == "__main__":
    main()
