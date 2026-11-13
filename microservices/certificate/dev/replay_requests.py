"""Reenvia pedidos de certificados de um evento já encerrado, usando presenças reais.

Uso na raiz: python microservices/certificate/dev/replay_requests.py --event-id UUID
Requer Docker Compose. Não altera status, inscrições ou presenças. A emissão é
idempotente por participante/evento; os pedidos passam pelo outbox do registration.
"""
import argparse
import subprocess
from pathlib import Path

SCRIPT = r"""
import { openDatabase } from '../shared/infrastructure/sqlite.js';
import { ActivitySqliteRepository } from './src/infrastructure/activity.sqlite.repository.js';
import { RegistrationSqliteRepository } from './src/infrastructure/registration.sqlite.repository.js';
import { EventSqliteRepository } from './src/infrastructure/event.sqlite.repository.js';
import { ParticipantSqliteRepository } from './src/infrastructure/participant.sqlite.repository.js';
import { AttendanceSqliteRepository } from './src/infrastructure/attendance.sqlite.repository.js';
import { CertificatePolicy } from './src/domain/certificate-policy.js';
import { RabbitMqMessageBus } from '../shared/messaging/rabbitmq-message-bus.js';
import { OutboxMessageBus } from '../shared/messaging/outbox-message-bus.js';
const db = openDatabase('registration');
const event = new EventSqliteRepository(db).getById(process.argv[1]);
if (event?.status !== 'ended') throw new Error('O evento deve existir e estar encerrado no registration.');
const activities = new ActivitySqliteRepository(db, new RegistrationSqliteRepository(db)).listHeadersByEvent(event.id);
const attendances = activities.flatMap(a => new AttendanceSqliteRepository(db).listByActivity(a.id));
const participants = new Map(attendances.map(a => [a.userId, new ParticipantSqliteRepository(db).getById(a.userId)]));
const requests = new CertificatePolicy().requests(event, activities, attendances, participants);
const broker = await RabbitMqMessageBus.connect();
const outbox = new OutboxMessageBus(db, broker, {source: 'registration'});
outbox.transaction(() => { for (const request of requests) outbox.publish(request); });
await outbox.flush();
if (outbox.pending()) throw new Error('Existem pedidos no outbox aguardando envio.');
console.log(JSON.stringify({eventId: event.id, eventName: event.name, requests: requests.length}));
db.close();
process.exit(0);
"""


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--event-id', required=True)
    args = parser.parse_args()
    compose = Path(__file__).resolve().parents[2] / 'docker-compose.yml'
    subprocess.run(['docker', 'compose', '-f', str(compose), 'exec', '-T', 'registration',
                    'node', '--input-type=module', '-e', SCRIPT, '--', args.event_id], check=True)
