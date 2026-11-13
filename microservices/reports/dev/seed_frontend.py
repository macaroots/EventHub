"""Cria um evento de demonstração via secretaria e popula somente sua projeção reports.

Uso: python microservices/reports/dev/seed_frontend.py --organizer USER_ID
     [--co-organizer USER_ID]. Requer o ambiente Docker Compose em execução.
Não altera eventos existentes; executar novamente reutiliza o evento de demonstração.
As inscrições, pagamentos e presenças fictícios existem apenas no reports.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

COMPOSE = Path(__file__).resolve().parents[2] / "docker-compose.yml"


def execute(service, command, payload=None):
    result = subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE), "exec", "-T", service, *command],
        input=json.dumps(payload, ensure_ascii=False) if payload is not None else None,
        encoding="utf-8", capture_output=True, check=True,
    )
    return json.loads(result.stdout)


CREATE_EVENT = r"""
import jwt from 'jsonwebtoken';
const config = JSON.parse(process.argv[1]);
const token = jwt.sign({userId: config.organizer}, process.env.JWT_SECRET, {expiresIn: '10m'});
const base = process.env.SECRETARIAT_URL || 'http://secretariat:3000';
async function api(path, body) {
    const response = await fetch(base + path, {method: body ? 'POST' : 'GET',
        headers: {authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
        ...(body && {body: JSON.stringify(body)})});
    if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
    return response.status === 204 ? null : response.json();
}
const name = '[DEMO Reports] Congresso de Tecnologia 2026';
let event = (await api('/events')).find(e => e.name === name);
if (!event) {
    const created = await api('/events', {name, information: 'Dados fictícios para demonstrar relatórios. Inscrições e pagamentos mockados apenas no reports.', startDate: '2026-11-20', endDate: '2026-11-22'});
    event = await api(`/events/${created.id}`);
}
if (config.coOrganizer && !event.organizers.includes(config.coOrganizer))
    await api(`/events/${event.id}/organizers`, {userId: config.coOrganizer});
event = await api(`/events/${event.id}`);
if (event.status === 'draft') {
    const activities = [
        {name: 'Minicurso de APIs e FastAPI', capacity: 30, price: 100, location: 'Laboratório 1', startsAt: '2026-11-20T13:00:00Z', endsAt: '2026-11-20T16:00:00Z'},
        {name: 'Arquitetura de Microsserviços', capacity: 20, price: 50, location: 'Auditório', startsAt: '2026-11-21T13:00:00Z', endsAt: '2026-11-21T15:00:00Z'},
    ];
    for (const activity of activities) if (!event.activities.some(a => a.name === activity.name))
        await api('/activities', {...activity, eventId: event.id, description: 'Atividade de demonstração dos relatórios.', rules: []});
    await api(`/events/${event.id}/publish`, {});
}
console.log(JSON.stringify(await api(`/events/${event.id}`)));
"""

APPLY_REPORTS = r"""
import json, sys
from pathlib import Path
from app.application.projections import ProjectionService
from app.config import Settings
from app.infrastructure.database import ReportsRepository
repository = ReportsRepository(str(Path(Settings.from_env().data_dir) / 'reports.db'))
projection = ProjectionService(repository)
try:
    results = [projection.apply(event) for event in json.load(sys.stdin)]
    print(json.dumps({'applied': sum(r.applied for r in results), 'ignored': sum(not r.applied for r in results)}))
finally:
    repository.close()
"""

VERIFY = r"""
import jwt from 'jsonwebtoken';
const config = JSON.parse(process.argv[1]);
const token = jwt.sign({userId: config.organizer}, process.env.JWT_SECRET, {expiresIn: '10m'});
const base = `http://localhost:3000/organizers/events/${config.id}`;
const options = {headers: {cookie: `token=${token}`}, redirect: 'manual'};
const page = await fetch(base, options);
if (page.status !== 200 || !(await page.text()).includes('panel-reports')) throw new Error('Página do evento indisponível');
const response = await fetch(`${base}/reports`, options);
if (!response.ok) throw new Error(`Relatório: ${response.status} ${await response.text()}`);
const report = await response.json();
const participants = await fetch(`${base}/reports/participants?page=2`, options);
const data = await participants.json();
if (!participants.ok || data.total !== 36 || data.items.length !== 11) throw new Error('Paginação inválida');
const download = await fetch(`${base}/reports/download`, options);
const bytes = new Uint8Array(await download.arrayBuffer());
if (!download.ok || bytes[0] !== 80 || bytes[1] !== 75) throw new Error('XLSX inválido');
console.log(JSON.stringify({url: base, registrations: report.totals.registrations, attendances: report.totalAttendances, payments: report.payments, xlsxBytes: bytes.length}));
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--organizer', required=True)
    parser.add_argument('--co-organizer')
    args = parser.parse_args()
    config = {'organizer': args.organizer, 'coOrganizer': args.co_organizer}
    event = execute('web', ['node', '--input-type=module', '-e', CREATE_EVENT, json.dumps(config)])
    events = []
    stamp = datetime.now(timezone.utc)

    def add(kind, **data):
        index = len(events)
        events.append({'type': kind, **data, 'messageId': f'demo-reports-{event["id"]}-{index}',
                       'occurredAt': (stamp + timedelta(milliseconds=index)).isoformat()})

    add('EventCreated', eventId=event['id'], name=event['name'], status=event['status'],
        startDate=event['startDate'], endDate=event['endDate'], organizers=event['organizers'])
    activities = sorted(event['activities'], key=lambda activity: activity['name'])
    for activity in activities:
        add('ActivityCreated', **{k: v for k, v in activity.items() if k != 'id'}, activityId=activity['id'])
    names = ['Ana Silva', 'Bruno Santos', 'Carla Oliveira', 'Daniel Souza', 'Elisa Lima', 'Felipe Costa', 'Gabriela Alves', 'Hugo Martins', 'Isabela Rocha', 'João Pereira', 'Larissa Dias', 'Marcos Ferreira']
    for i in range(36):
        user = f'demo-{event["id"]}-user-{i+1}'
        registration = f'demo-{event["id"]}-registration-{i+1}'
        payment = f'demo-{event["id"]}-payment-{i+1}'
        activity = activities[i % len(activities)]
        status = 'canceled' if i % 6 == 0 else 'pending' if i % 6 == 1 else 'confirmed'
        add('UserCreated', userId=user, name=f'{names[i % len(names)]} {i+1:02d}', email=f'participante{i+1:02d}@example.com')
        add('RegistrationCreated', id=registration, userId=user, activityId=activity['id'], eventId=event['id'], status=status)
        add('PaymentRequested', paymentId=payment, registrationId=registration, userId=user, amount=activity['price'], description=f'Inscrição demo - {activity["name"]}')
        if status != 'pending':
            add('PaymentDenied' if status == 'canceled' else 'PaymentApproved', paymentId=payment, registrationId=registration, userId=user, amount=activity['price'])
        if status == 'confirmed' and i % 3 != 0:
            add('UserCheckedIn', eventId=event['id'], activityId=activity['id'], userId=user, checkedInAt=stamp.isoformat())
    applied = execute('reports', ['python', '-c', APPLY_REPORTS], events)
    verified = execute('web', ['node', '--input-type=module', '-e', VERIFY, json.dumps({**config, 'id': event['id']})])
    print(json.dumps({'seed': applied, **verified}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
