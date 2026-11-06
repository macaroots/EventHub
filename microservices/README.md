# Microservices

## Rodando com Docker Compose

```sh
cd microservices
docker compose up -d --build   # sobe tudo
docker compose logs -f <serviço>
docker compose down            # -v para apagar os bancos
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

## Persistência

Cada serviço tem seu SQLite (`node:sqlite`) em `<serviço>/data/<serviço>.db`, num volume `<serviço>-data` do compose. O banco é aberto por [shared/infrastructure/sqlite.js](shared/infrastructure/sqlite.js), e os repositórios estendem [SqliteRepository](shared/infrastructure/sqlite.repository.js), que tem `upsert` para as projeções. `MapRepository` (em memória) fica para os testes.

- Um banco por serviço: nenhum serviço lê a tabela de outro. O que vem de fora chega por mensagem e vira projeção local. Capacidade de negócio, dados e projeções de cada serviço: [docs/arquitetura.md](../docs/arquitetura.md#capacidades-de-negócio-dados-e-projeções).
- Limitação: o banco é salvo antes de publicar as mensagens, sem outbox. Se o serviço cair entre as duas coisas, a mensagem se perde. Alternativa: tabela outbox na mesma transação.

## Documentação da API (Swagger)

Cada serviço serve o Swagger UI em `/docs` e o contrato em `/openapi.yaml` (ex.: http://localhost:3001/docs). Ambos são públicos. No Swagger UI, "Authorize" recebe o token de `POST /auth` do identity.

- O contrato é escrito à mão em `<serviço>/src/openapi.yaml` e servido por [shared/application/api-docs.js](shared/application/api-docs.js) (`swagger-ui-express`). Rota nova → documentar no YAML.
- O teste `test/openapi.test.js` de cada serviço falha se houver rota sem documentação ou documentação sem rota. Ele não confere corpos nem respostas.
- O web (BFF) não tem API própria: são telas.
- Alternativas: anotações JSDoc por rota (`swagger-jsdoc`), que espalham YAML nos comentários; geração automática (`swagger-autogen`), que não enxerga as rotas do `CrudController` nem os corpos; ou schemas de validação (zod + `zod-to-openapi`), que geram o contrato e validam a entrada, mas exigem refatorar as rotas.
- Depois de mudar dependências do `shared`, suba com `--build`.

## Autenticação

Todos os endpoints de secretariat e registration exigem `Authorization: Bearer <token>`.

```sh
curl -X POST localhost:3003/users -H 'Content-Type: application/json' -d '{"username":"ana","password":"123"}'
curl -X POST localhost:3003/auth  -H 'Content-Type: application/json' -d '{"username":"ana","password":"123"}'  # -> {user, token}
```

- JWT HS256 ([shared/auth/jwt.js](shared/auth/jwt.js), lib `jsonwebtoken`), validade 8h, payload `{sub, username, role}`. Todos os serviços usam o mesmo `JWT_SECRET` (compose: padrão `dev-secret-change-me`; sem ele o serviço não sobe).
- Admin: criado na subida do identity a partir de `ADMIN_USERNAME`/`ADMIN_PASSWORD` (padrão `admin`/`admin`). O cadastro público só cria `role: user`.
- Trade-off: com HS256, qualquer serviço que verifica tokens também consegue emiti-los. Alternativa: RS256 (identity assina com chave privada; os demais têm só a pública).
- Limitações: senha em texto puro no identity; payment ainda sem auth.

## Web (BFF)

`web` renderiza as páginas no servidor (Express + EJS) e é o BFF: chama os serviços pela rede interna do docker, repassando o JWT do cookie `token` (httpOnly) como `Authorization: Bearer`.

```
web/src/
  main.js        # só monta o app
  middleware/    # authenticate (sem token → /auth/login), layout (res.layout)
  clients/       # um arquivo por serviço; http.js é o cliente genérico
  routes/        # express.Router por feature
  views/
```

- URLs dos serviços: `IDENTITY_URL`, `SECRETARIAT_URL`, `REGISTRATION_URL`, `PAYMENT_URL` (definidas no compose).
- Não há API Gateway: com SSR, o browser só fala com o `web`. Se surgir uma SPA, um app mobile ou terceiros, coloque um gateway de infra (Traefik/Nginx), que roteia por configuração e não precisa de código por endpoint.
- Os clients expõem só o que as telas usam. Se virar repasse puro, uma alternativa é usar um proxy (`http-proxy-middleware`).
- Telas: ver [web/README.md](web/README.md).

## Entidades de domínio

- Estado em campos privados (`#name`), validado por setters privados (`#setName`). Invariantes que envolvem mais de um campo (ex.: período) ficam em um único setter.
- `X.create(props)` cria uma entidade nova (gera o id e define o estado inicial); `new X(props)` reconstitui a partir do banco. Os dois recebem um objeto desestruturado.
- `update(changes)` faz PATCH (só altera campos definidos e ignora `id`). `null` limpa um campo opcional, ex.: `{ "endDate": null }`. `Event.endDate` e `Activity.endsAt` são opcionais; para publicar um evento, só o `startDate` é exigido. O id vem separado, na camada de aplicação: `service.update(id, changes)`.
- `toJSON()` lista os campos explicitamente e é usado para persistência e mensagens.
- Limitação: se um setter falha no meio do `update`, a instância fica parcialmente alterada em memória. Isso é inofensivo porque o repositório não salva quando há exceção.

## Mensagens

| Tipo | Publicado por | Quem ouve |
|------|---------------|-----------|
| `EventPublished {eventId, name, startDate, endDate, organizers, activities: [{activityId, name, startsAt, endsAt, capacity, price, rules}]}` | secretariat | registration: cria a cópia imutável do evento e das atividades (uma vez) e abre as inscrições |
| `EventCanceled {eventId, reason}` | secretariat | registration: cancela as inscrições |
| `EventOrganizersChanged {eventId, organizers}` | secretariat (só evento publicado) | registration: autorização da gestão das inscrições |
| `RegistrationCreated/Promoted/Confirmed/Canceled` | registration | payment: `Canceled` cancela a cobrança pendente; (notificações, futuro) |
| `PaymentRequested {paymentId, registrationId, userId, amount, description}` | registration | payment: cria a cobrança (idempotente) |
| `PaymentConfirmed/Denied {paymentId, registrationId}` | payment | registration: confirma a reserva / cancela |

Pagar: `POST localhost:3004/payments/:id/pay {"receipt": "..."}`; consultar: `GET /payments/:id`. O gateway é uma porta (`verify(payment, receipt)`); o adaptador atual é fake e recusa o comprovante `deny`.

