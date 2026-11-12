# Contratos entre serviços (RQ05)

- Mensagens: um JSON Schema por mensagem em [messages/](messages/), com os campos comuns em [envelope.schema.json](messages/envelope.schema.json).
- HTTP: o `openapi.yaml` de cada serviço Node e o OpenAPI gerado pelo FastAPI nos serviços Python. Só o `web` chama os serviços por HTTP.
- Teste: `npm i && npm test` valida os exemplos dos schemas e as mensagens que os domínios geram ([test/messages.test.js](test/messages.test.js)). Mudou uma mensagem, mude o schema junto.

## Transporte (RabbitMQ)

| Item | Valor |
|------|-------|
| Exchange | `event-hub`, `topic`, durável |
| Routing key | o `type` da mensagem, ex.: `PaymentRequested` |
| Fila | uma fila durável por serviço, com o nome do serviço |
| Retry / DLQ | `<fila>.retry` (5 s), até 5 tentativas; depois `<fila>.dlq` |
| Propriedades AMQP | `persistent`, `application/json`; `messageId`, `type`, `appId` = `id`, `type`, `source` do envelope |
| Consumo | `prefetch 1`, `ack` só depois de tratar |

## Envelope

Toda mensagem tem metadados no envelope e o conteúdo em `data`.

```json
{
  "id": "0b9c6c1e-3f0a-4d38-9d2e-6f1c2a7b8e01",
  "type": "PaymentRequested",
  "source": "registration",
  "time": "2026-11-06T13:00:00.000Z",
  "data": { "paymentId": "…", "registrationId": "…", "userId": "…", "amount": 50, "description": "Ticket" }
}
```

- Subconjunto do [CloudEvents](https://cloudevents.io) 1.0. `id` serve à idempotência (inbox); cada `type` tem um único `source`.
- **Produtor:** grava a mensagem na mesma transação do estado (outbox) e só apaga quando o broker confirma.
- **Consumidor:** entrega *pelo menos uma vez*: ignore `id` repetido e mantenha o handler idempotente. Ignore campos desconhecidos (tolerant reader). Mensagem inválida deve falhar e ir para a DLQ.
- **Evolução:** campo novo opcional não quebra. Remover, renomear ou tornar obrigatório quebra: crie um tipo novo (ex.: `EventPublishedV2`).

## Mensagens

| Mensagem | Produtor → consumidores | Idempotência |
|----------|-------------------------|--------------|
| [UserRegistered](messages/UserRegistered.schema.json) | identity → registration, notification, reports | upsert |
| [UserUpdated](messages/UserUpdated.schema.json) | identity (não publica hoje) → registration, notification, reports | upsert |
| [UserDeactivated](messages/UserDeactivated.schema.json) | identity (não publica hoje) → notification | — |
| [EventPublished](messages/EventPublished.schema.json) | secretariat → registration, reports | ignora o que já existe |
| [EventOrganizersChanged](messages/EventOrganizersChanged.schema.json) | secretariat → registration, reports | lista completa, sobrescreve |
| [EventCanceled](messages/EventCanceled.schema.json) | secretariat → registration, reports | ignora evento já cancelado |
| [EventEnded](messages/EventEnded.schema.json) | secretariat → registration, reports | só age em evento `published` |
| [PaymentRequested](messages/PaymentRequested.schema.json) | registration → payment, notification, reports | ignora `paymentId` existente |
| [RegistrationCreated](messages/RegistrationCreated.schema.json) | registration → notification, reports | upsert |
| [RegistrationPromoted](messages/RegistrationPromoted.schema.json) | registration → reports | upsert |
| [RegistrationConfirmed](messages/RegistrationConfirmed.schema.json) | registration → notification, reports | upsert |
| [RegistrationCanceled](messages/RegistrationCanceled.schema.json) | registration → payment, notification, reports | cancelar de novo não muda nada |
| [PaymentConfirmed](messages/PaymentConfirmed.schema.json) | payment → registration, notification, reports | ignora se a inscrição não espera esse `paymentId` |
| [PaymentDenied](messages/PaymentDenied.schema.json) | payment → registration, notification, reports | idem |
| [AttendanceRegistered](messages/AttendanceRegistered.schema.json) | registration → reports | uma presença por inscrição |
| [CertificateRequested](messages/CertificateRequested.schema.json) | registration → certificate | `requestId` = `<eventId>:<participantId>` |
| [CertificateIssued](messages/CertificateIssued.schema.json) | certificate → notification | publicado só na primeira emissão |

- `PaymentRequested` é um comando (destinatário único); as demais são eventos.
- O `paymentId` é gerado pelo registration: assim uma resposta atrasada de cobrança antiga é ignorada.
- Em `RegistrationCreated`, o id da inscrição vem em `data.id`, não em `data.registrationId`.
- O prazo de pagamento é um job do registration; o payment só sabe pelo `RegistrationCanceled`.

Limitações: schemas escritos à mão (o teste cobre só os cenários que exercita); os consumidores não validam os schemas em tempo de execução; sem id de correlação (RQ06).

O certificate (Python) não entra em `test/messages.test.js`; o envelope do `CertificateIssued` é conferido em `certificate/tests/test_event_publisher.py`.
