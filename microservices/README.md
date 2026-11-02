# Microservices

## Rodando com Docker Compose

```sh
cd microservices
docker compose up -d --build   # sobe tudo
docker compose logs -f <serviço>
docker compose down            # -v para apagar o banco do secretariat
```

| Serviço      | Host                   |
|--------------|------------------------|
| web          | http://localhost:3000  |
| registration | http://localhost:3001  |
| secretariat  | http://localhost:3002  |
| identity     | http://localhost:3003  |
| payment      | http://localhost:3004  |
| certificate  | http://localhost:3005  |
| RabbitMQ UI  | http://localhost:15673 (guest/guest) |

- Cada serviço tem seu próprio `<serviço>/Dockerfile` (permite linguagens diferentes no futuro). O build context é `microservices/` para incluir `shared/`, mantendo os imports relativos (`../../shared/...`).
- O compose define a porta de cada serviço `PORT`; e o endereço do broker `RABBITMQ_URL=amqp://rabbitmq`.
- AMQP (5672) não é exposto no host, para não conflitar com outro RabbitMQ local. Para rodar um serviço fora do Docker contra este broker, adicione `"5672:5672"` em `ports` do `rabbitmq`.
- O `certificate` é o único serviço em **Python** (FastAPI + Uvicorn). Ele usa `JWT_SECRET` para validar o token do usuário e consome `CertificateRequested` do RabbitMQ (fila `certificate`) para emitir os certificados. Não há chamada HTTP entre `certificate` e `registration`.

## Desenvolvimento (hot reload)

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

[docker-compose.dev.yml](docker-compose.dev.yml) monta `<serviço>/src` e `shared/` do host e roda `node --watch`: salvar um arquivo reinicia o serviço. O `certificate` monta `certificate/app` e roda `uvicorn --reload`.

- Mudanças em `package.json` (dependências) exigem `--build`.
- Se um serviço quebrar com erro de sintaxe, ele espera a próxima alteração; se o arquivo for substituído (ex.: `git checkout`), pode ser preciso `docker compose ... restart <serviço>`.
- Alternativa não usada: `docker compose watch` (`develop.watch`), que sincroniza arquivos em vez de bind mount.
- Sem dev override: mudanças de código exigem `docker compose up -d --build`.

## Autenticação

Todos os endpoints de secretariat e registration exigem `Authorization: Bearer <token>`.

```sh
curl -X POST localhost:3003/users -H 'Content-Type: application/json' -d '{"username":"ana","password":"123"}'
curl -X POST localhost:3003/auth  -H 'Content-Type: application/json' -d '{"username":"ana","password":"123"}'  # -> {user, token}
```

- JWT HS256 ([shared/auth/jwt.js](shared/auth/jwt.js), lib `jsonwebtoken`), validade 8h, payload `{sub, username, role}`. Todos os serviços usam o mesmo `JWT_SECRET` (compose: padrão `dev-secret-change-me`; sem ele o serviço não sobe).
- Admin: criado na subida do identity a partir de `ADMIN_USERNAME`/`ADMIN_PASSWORD` (padrão `admin`/`admin`). O cadastro público só cria `role: user`.
- Trade-off: com HS256, qualquer serviço que verifica tokens também consegue emiti-los. Alternativa: RS256 (identity assina com chave privada; os demais têm só a pública).
- Limitações: senha em texto puro e usuários em memória no identity; payment ainda sem auth.

## Mensagens

| Tipo | Publicado por | Quem ouve |
|------|---------------|-----------|
| `EventCreated/Updated/Published/Canceled` `{eventId, name, description, location, startDate, endDate, status[, reason]}` | secretariat | registration: só aceita inscrição em evento `published`; ao cancelar, cancela as inscrições |
| `EventDeleted {eventId}` | secretariat | — |
| `ActivityCreated/Updated {activityId, eventId, name, startsAt, endsAt, capacity, rules}` | secretariat | registration: upsert da projeção `Activity` |
| `ActivityDeleted {activityId}` | secretariat | registration |
| `RegistrationCreated/Confirmed/Canceled` | registration | (notificações, futuro) |
| `PaymentRequested {paymentId, registrationId, userId, amount, description}` | registration | payment: cria a cobrança (idempotente) |
| `PaymentConfirmed/Denied {paymentId, registrationId}` | payment | registration: resolve a pendência / cancela |

Pagar: `POST localhost:3004/payments/:id/pay {"receipt": "..."}`. O gateway é uma porta (`verify(payment, receipt)`); o adaptador atual é fake e recusa o comprovante `nao`.

