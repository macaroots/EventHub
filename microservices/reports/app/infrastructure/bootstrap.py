"""Rebuild missing report projections from the services' local SQLite snapshots."""
import json
import logging
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)


def _rows(path, table):
    if not path or not Path(path).is_file():
        return []
    db = sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True, timeout=5)
    db.row_factory = sqlite3.Row
    try:
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
            return []
        return [dict(row) for row in db.execute(f'SELECT * FROM {table}')]
    finally:
        db.close()


def bootstrap(projections, event_db, registration_db, payment_db):
    def emit(kind, **data):
        projections.apply({'type': kind, **data})

    for e in _rows(event_db, 'events'):
        emit('EventCreated', eventId=e['id'], name=e['name'], information=e.get('information'),
             startDate=e.get('startDate'), endDate=e.get('endDate'), status=e['status'],
             organizers=json.loads(e['organizers']))
    for a in _rows(registration_db, 'activities'):
        emit('ActivityCreated', activityId=a['id'], eventId=a['eventId'], name=a['name'],
             startsAt=a.get('startsAt'), endsAt=a.get('endsAt'), capacity=a['capacity'], price=a['price'],
             rules=json.loads(a['rules']))
    for p in _rows(registration_db, 'participants'):
        emit('UserCreated', userId=p['id'], name=p.get('name') or p.get('username'))
    for r in _rows(registration_db, 'registrations'):
        emit('RegistrationCreated', id=r['id'], userId=r['userId'], activityId=r['activityId'],
             status=r['status'], requirements=json.loads(r['requirements']), reasons=json.loads(r['reasons']))
    for a in _rows(registration_db, 'attendances'):
        emit('UserCheckedIn', activityId=a['activityId'], userId=a['userId'], checkedInAt=a['checkedInAt'])
    for p in _rows(payment_db, 'payments'):
        emit('PaymentRequested', paymentId=p['id'], registrationId=p['registration_id'], userId=p.get('user_id'), amount=p['amount'], description=p.get('description'))
        if p['status'] == 'paid':
            emit('PaymentConfirmed', paymentId=p['id'], registrationId=p['registration_id'], amount=p['amount'])
        elif p['status'] == 'denied':
            emit('PaymentDenied', paymentId=p['id'], registrationId=p['registration_id'])
    logger.info('Report projections initialized from available service snapshots')
