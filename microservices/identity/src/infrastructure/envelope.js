// Integração – converte a linha do outbox no envelope comum (contracts/README.md): {id, type, source, time, data}.
// A routing key é o type, como nos outros serviços.
export function toEnvelope(payload) {
  const { eventId, type, occurredAt, data } = typeof payload === 'string' ? JSON.parse(payload) : payload;
  return { id: eventId, type, source: 'identity', time: occurredAt, data };
}
