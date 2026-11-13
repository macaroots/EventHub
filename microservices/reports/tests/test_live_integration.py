from app.application.projections import ProjectionService
from app.infrastructure.database import ReportsRepository
from app.infrastructure import bootstrap as bootstrap_module


def envelope(message_id, kind, data):
    return {'id': message_id, 'type': kind, 'source': 'registration', 'time': '2030-01-01T00:00:00Z', 'data': data}


def test_current_envelope_projects_activity_registration_and_attendance():
    repo = ReportsRepository(':memory:')
    projections = ProjectionService(repo)
    event = envelope('1', 'EventPublished', {'eventId':'e1', 'name':'Evento', 'organizers':['org'], 'activities':[{'activityId':'a1','name':'Oficina','capacity':10,'price':25}]})
    projections.apply(event)
    projections.apply(event)
    projections.apply(envelope('2', 'RegistrationCreated', {'id':'r1','userId':'u1','activityId':'a1','status':'awaiting_payment'}))
    projections.apply(envelope('3', 'RegistrationConfirmed', {'registrationId':'r1','userId':'u1'}))
    projections.apply(envelope('4', 'AttendanceRegistered', {'activityId':'a1','userId':'u1','checkedInAt':'2030-01-01T00:00:00Z'}))
    assert repo.get_event('e1').name == 'Evento'
    assert repo.get_activity('a1').name == 'Oficina'
    assert repo.list_registrations(event_id='e1')[0].status == 'confirmed'
    assert len(repo.list_attendances(event_id='e1')) == 1
    repo.close()


def test_bootstrap_recovers_existing_event_and_payment(monkeypatch):
    snapshots = {
        'events':[{'id':'e1','name':'Evento','information':None,'startDate':'2030-01-01','endDate':'2030-01-01','status':'ended','organizers':'["org"]'}],
        'activities':[{'id':'a1','eventId':'e1','name':'Oficina','startsAt':None,'endsAt':None,'capacity':10,'price':25,'rules':'[]'}],
        'participants':[{'id':'u1','name':'Ana'}],
        'registrations':[{'id':'r1','userId':'u1','activityId':'a1','status':'confirmed','requirements':'[]','reasons':'[]'}],
        'attendances':[{'activityId':'a1','userId':'u1','checkedInAt':'2030-01-01T00:00:00Z'}],
        'payments':[{'id':'p1','registration_id':'r1','user_id':'u1','amount':25,'status':'paid','description':'Ticket'}],
    }
    monkeypatch.setattr(bootstrap_module, '_rows', lambda path, table: snapshots[table])
    repo = ReportsRepository(':memory:')
    bootstrap_module.bootstrap(ProjectionService(repo), 'events', 'registration', 'payments')
    assert repo.get_event('e1').status == 'ended'
    assert repo.get_event('e1').organizers == ('org',)
    assert len(repo.list_attendances(event_id='e1')) == 1
    assert repo.list_payments(event_id='e1')[0].status == 'approved'
    repo.close()
