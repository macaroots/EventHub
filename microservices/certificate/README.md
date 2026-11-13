# Certificate (Python)

Microserviço responsável por emitir, consultar, baixar e validar certificados.
Implementado com **FastAPI + Uvicorn**, persistência em **SQLite** e PDF gerado
sob demanda com **ReportLab** + **QR Code**.

A emissão é **orientada a evento**: o `registration` publica
`CertificateRequested` e o serviço consome da fila `certificate`. Não existe
chamada HTTP entre os serviços.

## Endpoints

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `POST` | `/events/{eventId}/certificates` | JWT | Informa se o certificado já foi emitido: `200 { certificateId }` ou `404` |
| `GET` | `/certificates` | JWT | Lista os certificados do usuário |
| `GET` | `/certificates/{id}` | JWT (dono/admin) | Metadados do certificado |
| `GET` | `/certificates/{id}/download` | JWT (dono/admin) | PDF do certificado |
| `GET` | `/certificates/validate/{token}` | pública | Validação pública pelo token |
| `GET` | `/health` | pública | Health check |

O `POST` **não emite** mais nada: ele só consulta o que o consumidor já criou.
A emissão acontece quando o `CertificateRequested` chega.

## Evento consumido

Fila `certificate`, exchange `event-hub` (topic), routing key `CertificateRequested`,
`prefetch(1)`, mensagens persistentes.

```json
{
  "type": "CertificateRequested",
  "participantId": "user-1",
  "participantName": "Maria Silva",
  "eventId": "event-1",
  "eventName": "Congresso X",
  "eventDate": "2026-11-07",
  "activities": [{ "name": "Minicurso A" }, { "name": "Palestra B" }]
}
```

- O consumidor aceita o envelope atual `{id, type, source, time, data}` do
  outbox do registration. Nele, `data.userId` identifica o participante e a
  data do certificado vem da primeira data das atividades com presença
  (`data.activities[].date`). O formato plano abaixo continua aceito pelo script de desenvolvimento.
- `participantId` vira `user_id` do certificado.
- `eventDate` precisa ser `YYYY-MM-DD`; data com hora é rejeitada.
- `activities` precisa ter pelo menos um item com `name`.
- `verificationToken`, `issuedAt` e o `id` são gerados aqui.
- Reentrega é idempotente por `(participantId, eventId)`: devolve o certificado
  existente e **não** republica `CertificateIssued`.
- Payload inválido vai para `nack(requeue=False)`; erro transitório para
  `nack(requeue=True)`.

Depois de criar, o serviço publica `CertificateIssued` (best-effort, opcional).

## Configuração

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` | `3005` | porta HTTP |
| `JWT_SECRET` | — | validação do JWT do usuário (HS256) |
| `PUBLIC_BASE_URL` | `http://localhost:3005` | URL de validação no PDF/QR |
| `CERTIFICATE_DATA_DIR` / `DADOS` | `data` | diretório do SQLite |
| `RABBITMQ_URL` | — | conexão com o RabbitMQ (consumo e publicação) |

Sem `RABBITMQ_URL` o serviço sobe, serve a API, mas **não consome eventos** —
nada é emitido.

## Desenvolvimento

```sh
cd microservices/certificate
python -m pip install -r requirements-dev.txt
python -m pytest
```

Para subir localmente com RabbitMQ e testar o fluxo completo:

```sh
# terminal 1 (em microservices/): broker
docker compose up -d rabbitmq

# terminal 2: serviço
$env:RABBITMQ_URL="amqp://localhost"
$env:JWT_SECRET="dev-secret-com-pelo-menos-32-bytes"
$env:PUBLIC_BASE_URL="http://127.0.0.1:3005"
$env:CERTIFICATE_DATA_DIR=".\data"
python -m uvicorn app.main:app --host 127.0.0.1 --port 3005 --reload
```

Em outro terminal, publique o evento:

```sh
$env:RABBITMQ_URL="amqp://localhost"
python dev\publish_certificate_requested.py --participant-id user-1 --event-id event-1
```

Sem RabbitMQ, o `--direct` chama a `CertificateService.criar` direto no SQLite:

```sh
python dev\publish_certificate_requested.py --direct
```

O roteiro completo de requisições manuais está em
[docs/plans/certificado-microservice.md](../../docs/plans/certificado-microservice.md), seção 15.

## Docker

O build context é `microservices/` (definido no compose):

```sh
cd microservices
docker compose up -d --build certificate
```

O compose já injeta `RABBITMQ_URL=amqp://rabbitmq` e mantém a fila `certificate`
durável. Suba o `certificate` **antes** de o `registration` começar a publicar:
o exchange é topic e mensagens sem fila ligada são descartadas.

Para recuperar pedidos que não chegaram ao consumidor antes de uma correção,
com o certificate já conectado ao broker, execute a partir da raiz:

```sh
python microservices/certificate/dev/replay_requests.py --event-id UUID
```

O script usa somente as presenças reais de um evento encerrado no registration
e reenvia os pedidos pelo outbox, sem reabrir o evento. Repetições não duplicam
certificados, pois a emissão é idempotente por participante/evento.
