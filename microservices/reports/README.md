# Reports (Python)

Microserviço de **monitoramento e relatórios** por evento/atividade. É um
**read model (CQRS)**: consome eventos do RabbitMQ, mantém projeções locais em
SQLite e responde JSON, CSV, XLSX e PDF sob demanda. Não lê o banco de outro
serviço e não faz chamada HTTP para `secretariat`, `registration`, `payment` ou
`identity`.

Stack igual à do `certificate`: **FastAPI + Uvicorn**, SQLite, `aio-pika`,
PyJWT e ReportLab. A única dependência extra é `openpyxl`, usada só no XLSX.

## Endpoints

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `GET` | `/reports/events/{eventId}` | organizador/admin | Relatório do evento; `?format=json\|csv\|xlsx\|pdf` |
| `GET` | `/reports/activities/{activityId}` | organizador/admin | Relatório da atividade; `?format=...` |
| `GET` | `/reports/events/{eventId}/participants` | organizador/admin | Lista de presença/inscrições, com filtros e export |
| `GET` | `/health` | pública | Banco, consumer e último evento aplicado |

Parâmetros:

| Param | Onde | Valores | Padrão |
|---|---|---|---|
| `format` | todas | `json`, `csv`, `xlsx`, `pdf` | `json` |
| `include` | evento/atividade | `activities,participants,payments` (CSV) | `activities` |
| `activityId` | participantes | id da atividade | todos |
| `status` | participantes | `pending,confirmed,canceled` (CSV) | todos |
| `checkedIn` | participantes | `true`, `false` | todos |
| `page` | participantes JSON | inteiro ≥ 1 | `1` |
| `limit` | participantes JSON | 1..1000 | `100` |

Todas as respostas de relatório levam `Cache-Control: no-store` e
`X-Report-Updated-At` (quando existe evento aplicado). Os exports usam
`Content-Disposition: attachment` com nome
`relatorio-evento-<slug>-<YYYYMMDD>.<ext>` (ou `atividade`/`participantes`).

## Autorização

- `Authorization: Bearer <JWT>` ou cookie `token`, igual ao `certificate`.
- Claims: `userId` (ou `sub`/`id`) e, opcionalmente, `role`.
- **Organizador**: `userId` presente em `events.organizers` da projeção.
- **Admin**: `role == "admin"` ou `userId` em `REPORTS_ADMIN_USER_IDS`
  (fallback porque o JWT atual do identity não tem role).
- Evento/atividade inexistente ou deletado → `404`; usuário sem permissão → `403`.

## Eventos consumidos

Fila `reports`, exchange `loja` (topic), `prefetch(1)`, mensagens persistentes.
Bindings para os `type` abaixo. O envelope aceita `messageId` e `occurredAt`
opcionais; `eventId` é sempre o id do evento de negócio.

- `EventCreated`, `EventUpdated`, `EventPublished`, `EventCanceled`, `EventDeleted`
- `ActivityCreated`, `ActivityUpdated`, `ActivityDeleted`
- `RegistrationCreated`, `RegistrationConfirmed`, `RegistrationCanceled`
- `PaymentRequested`, `PaymentApproved` **ou** `PaymentConfirmed`, `PaymentDenied`
- `UserCheckedIn`
- `UserCreated`, `UserUpdated` (opcional, para nome/e-mail da lista)

Regras principais:

- `UPSERT` idempotente; `messageId` deduplicado na tabela `inbox`.
- `occurredAt` mais antigo que o já aplicado é ignorado (`source_at`).
- Estados terminais: evento `canceled`, atividade deletada, inscrição
  `canceled` e pagamento `approved`/`denied` não voltam atrás.
- Presença é única por `(activityId, userId)`; o primeiro check-in vence.
- `RegistrationCreated`/`UserCheckedIn` podem chegar antes de `ActivityCreated`;
  o `eventId` é preenchido depois pelo relink.
- Payload inválido → `nack(requeue=False)`; erro transitório →
  `nack(requeue=True)`; tipo desconhecido → `ack`.

## Indicadores

- `totalRegistrations` = inscrições ativas (`pending + confirmed`).
- `totalRegistrationsConfirmed` = `confirmed`.
- `totalAttendances` = presenças distintas por `(activity_id, user_id)`.
- Ocupação da atividade = `confirmed / capacity`; capacidade `0` → `null`.
- Ocupação do evento = soma de confirmadas das atividades / soma das capacidades.
- Presença do evento = usuários distintos presentes / usuários distintos
  confirmados (evita passar de 100% quando a pessoa faz várias atividades).
- Pagamentos: contagens por status, valor esperado e valor aprovado.

Valores monetários chegam como decimal e são armazenados em **centavos**.

## Configuração

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` | `3006` | porta HTTP |
| `RABBITMQ_URL` | — | consumo da fila `reports` |
| `REPORTS_EXCHANGE` | `loja` | exchange topic |
| `REPORTS_QUEUE` | `reports` | fila durável |
| `JWT_SECRET` | — | validação do JWT (HS256) |
| `REPORTS_DATA_DIR` / `DADOS` | `data` | diretório do SQLite |
| `REPORTS_ADMIN_USER_IDS` | — | allowlist de admin, separada por vírgula |
| `REPORTS_CURRENCY` | `BRL` | moeda nos relatórios |
| `REPORTS_MAX_EXPORT_ROWS` | `10000` | teto de linhas por export (`413`) |

Sem `RABBITMQ_URL` o serviço sobe e serve a API, mas não projeta nada. O
`/health` informa `consumer.connected` e o último evento aplicado.

## Desenvolvimento

```sh
cd microservices/reports
python -m pip install -r requirements-dev.txt
python -m pytest
```

Para testar sem broker, popule o SQLite direto:

```sh
python dev/seed_report.py --event-id event-1 --organizer org-1
```

Para subir localmente e publicar a sequência de exemplo:

```sh
# terminal 1 (em microservices/): broker
docker compose up -d rabbitmq

# terminal 2: serviço
$env:RABBITMQ_URL="amqp://localhost"
$env:JWT_SECRET="dev-secret-com-pelo-menos-32-bytes"
$env:REPORTS_DATA_DIR=".\data"
python -m uvicorn app.main:app --host 127.0.0.1 --port 3006 --reload

# terminal 3: eventos de exemplo
$env:RABBITMQ_URL="amqp://localhost"
python dev\publish_events.py --event-id event-1
```

Gere um token de organizador (o identity ainda não emite JWT em dev):

```sh
python -c "import jwt; print(jwt.encode({'userId': 'org-1'}, 'dev-secret-com-pelo-menos-32-bytes', algorithm='HS256'))"
```

O roteiro completo de requisições manuais está em
[docs/plans/monitoramento-relatorios-microservice.md](../../docs/plans/monitoramento-relatorios-microservice.md),
seção 15.

> O fluxo ponta a ponta com os publishers reais depende da Fase 0 do plano:
> `registration` precisa publicar `Registration*`/`UserCheckedIn`, `payment`
> precisa incluir `registrationId`/`amount` e `secretariat` precisa emitir os
> payloads completos de `Event*`/`Activity*`.

## Docker

O build context é `microservices/` (definido no compose):

```sh
cd microservices
docker compose up -d --build reports
docker compose logs -f reports
curl.exe -i http://localhost:3006/health
```

O compose injeta `RABBITMQ_URL=amqp://rabbitmq` e usa o volume
`reports-data` em `/app/data`. Suba o `reports` **antes** de os publishers
operarem: o exchange é topic e mensagens sem fila ligada são descartadas. A
fila é durável, mas o RabbitMQ não guarda histórico depois do `ack`; sem event
store, a projeção não é reconstruível.
