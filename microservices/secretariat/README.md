
## Secretaria: eventos e atividades

| Rota | Descrição |
|------|-----------|
| `POST/GET/PUT/DELETE /events[/:id]` | CRUD de eventos (`{name}`). Não apaga evento com atividades. |
| `POST/GET/PUT/DELETE /activities[/:id]` | CRUD de atividades (`{eventId, name, capacity, price}`; `price` 0 = gratuita). |
| `GET /events/:id/activities` | Programação do evento. |

Mensagens publicadas (integration events):

| Tipo | Payload | Quem ouve |
|------|---------|-----------|
| `EventCreated` / `EventUpdated` | `{eventId, name}` | (catálogo público, futuro) |
| `EventDeleted` | `{eventId}` | — |
| `ActivityCreated` / `ActivityUpdated` | `{activityId, eventId, capacity, price}` | registration: cria/atualiza sua projeção de `Activity` (upsert, idempotente); `price > 0` vira `PaymentRule` |
| `ActivityDeleted` | `{activityId}` | ainda ninguém (ver limitações) |

- `Activity` é um aggregate próprio que referencia `eventId`, não uma lista dentro de `Event`: muda com frequência e é a unidade de inscrição.
- Limitações: publicação não é transacional com o banco (sem outbox; se o RabbitMQ falhar após o `INSERT`, o registration fica desatualizado). `ActivityDeleted` não é tratado no registration (o que fazer com inscrições existentes ainda é decisão de domínio — provavelmente `ActivityCanceled` + cancelar inscrições). Reduzir `capacity` abaixo das inscrições confirmadas é rejeitado no registration, mas a secretaria não sabe disso.
