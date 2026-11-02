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
| RabbitMQ UI  | http://localhost:15673 (guest/guest) |

- Cada serviço tem seu próprio `<serviço>/Dockerfile` (permite linguagens diferentes no futuro). O build context é `microservices/` para incluir `shared/`, mantendo os imports relativos (`../../shared/...`).
- O compose define a porta de cada serviço `PORT`; e o endereço do broker `RABBITMQ_URL=amqp://rabbitmq`.
- AMQP (5672) não é exposto no host, para não conflitar com outro RabbitMQ local. Para rodar um serviço fora do Docker contra este broker, adicione `"5672:5672"` em `ports` do `rabbitmq`.

## Desenvolvimento (hot reload)

```sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

[docker-compose.dev.yml](docker-compose.dev.yml) monta `<serviço>/src` e `shared/` do host e roda `node --watch`: salvar um arquivo reinicia o serviço.

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

## Entidades de domínio

- Estado em campos privados (`#name`), validado por setters privados (`#setName`). Invariantes que envolvem mais de um campo (ex.: período) ficam em um único setter.
- `X.create(props)` cria uma entidade nova (gera o id e define o estado inicial); `new X(props)` reconstitui a partir do banco. Os dois recebem um objeto desestruturado.
- `update(changes)` faz PATCH (só altera campos definidos e ignora `id`). `null` limpa um campo opcional, ex.: `{ "endDate": null }`. `Event.endDate` e `Activity.endsAt` são opcionais; para publicar um evento, só o `startDate` é exigido. O id vem separado, na camada de aplicação: `service.update(id, changes)`.
- `toJSON()` lista os campos explicitamente e é usado para persistência e mensagens.
- Limitação: se um setter falha no meio do `update`, a instância fica parcialmente alterada em memória. Isso é inofensivo porque o repositório não salva quando há exceção.

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

