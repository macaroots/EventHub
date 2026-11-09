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

## Persistência

Cada serviço (menos o identity, em Postgres) tem seu SQLite (`node:sqlite`) em `<serviço>/data/<serviço>.db`, num volume `<serviço>-data` do compose. O banco é aberto por [shared/infrastructure/sqlite.js](shared/infrastructure/sqlite.js), e os repositórios estendem [SqliteRepository](shared/infrastructure/sqlite.repository.js), que tem `upsert` para as projeções. `MapRepository` (em memória) fica para os testes.

- Um banco por serviço: nenhum serviço lê a tabela de outro. O que vem de fora chega por mensagem e vira projeção local. Capacidade de negócio, dados e projeções de cada serviço: [docs/arquitetura.md](../docs/arquitetura.md#capacidades-de-negócio-dados-e-projeções).
- Estado e mensagens são gravados na mesma transação (outbox). Ver [Entrega das mensagens](#entrega-das-mensagens).

## Documentação da API (Swagger)

Cada serviço serve o Swagger UI em `/docs` e o contrato em `/openapi.yaml` (ex.: http://localhost:3001/docs). Ambos são públicos. No Swagger UI, "Authorize" recebe o JWT do cookie `access_token` de `POST /auth/login` do identity.

- O contrato é escrito à mão em `<serviço>/src/openapi.yaml` e servido por [shared/application/api-docs.js](shared/application/api-docs.js) (`swagger-ui-express`). Rota nova → documentar no YAML.
- O teste `test/openapi.test.js` de cada serviço falha se houver rota sem documentação ou documentação sem rota. Ele não confere corpos nem respostas.
- O web (BFF) não tem API própria: são telas.
- Alternativas: anotações JSDoc por rota (`swagger-jsdoc`), que espalham YAML nos comentários; geração automática (`swagger-autogen`), que não enxerga as rotas do `CrudController` nem os corpos; ou schemas de validação (zod + `zod-to-openapi`), que geram o contrato e validam a entrada, mas exigem refatorar as rotas.
- Depois de mudar dependências do `shared`, suba com `--build`.

## Autenticação

Todos os endpoints de secretariat e registration exigem `Authorization: Bearer <token>`. O token vem do identity:

```sh
curl -X POST localhost:3003/auth/register -H 'Content-Type: application/json' -d '{"name":"Ana","username":"ana","email":"ana@ex.com","password":"12345678"}'
curl -i -X POST localhost:3003/auth/login -H 'Content-Type: application/json' -d '{"username":"ana","password":"12345678"}'  # Set-Cookie: access_token=<JWT>
```

- JWT HS256 com payload `{userId}`, validade `JWT_EXPIRES_IN` (compose: 1h). O identity assina; os demais validam com [shared/auth/jwt.js](shared/auth/jwt.js) (`req.user = {id}`). Todos usam o mesmo `JWT_SECRET`.
- `.env` (em `microservices/`, fora do git): `JWT_SECRET`, `INTERNAL_API_TOKEN` (rotas `/internal` do identity) e `IDENTITY_DB_PASSWORD`. Sem eles, o compose sobe com valores vazios e o identity não inicia.
- O identity usa Postgres (`identity-db`, volume `identity-db-data`) e roda as migrações (`scripts/migrate.js`) na subida. Os demais continuam em SQLite ([ADR 000](../docs/adrs/000-escolha-banco.md)).
- Sem papel de admin: o token não tem role. Quem gerencia um evento é quem está em `organizers` (o código `isAdmin` ficou, mas nunca é verdadeiro).
- Trade-off: com HS256, qualquer serviço que verifica tokens também consegue emiti-los. Alternativa: RS256 (identity assina com chave privada; os demais têm só a pública).
- Limitações: payment ainda sem auth; o seed `002_seed.sql` cria 3 usuários com hash placeholder (não fazem login nem chegam ao registration).

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

Contrato completo (transporte, envelope, cada mensagem com JSON Schema, quem produz e quem consome, fluxos): [contracts/README.md](contracts/README.md).

Pagar: `POST localhost:3004/payments/:id/pay {"receipt": "..."}`; consultar: `GET /payments/:id`. O gateway é uma porta (`verify(payment, receipt)`); o adaptador atual é fake e recusa o comprovante `deny`.

### Entrega das mensagens

[OutboxMessageBus](shared/messaging/outbox-message-bus.js) fica na frente do [RabbitMqMessageBus](shared/messaging/rabbitmq-message-bus.js), em cada serviço.

- **Outbox:** `messageBus.transaction(() => { repo.update(x); messageBus.publish(m); })` grava o estado e a mensagem (tabela `outbox`) juntos. Um relay envia ao broker depois do COMMIT (logo em seguida e a cada 1 s) e apaga a linha só quando o broker confirma (confirm channel). Se o broker estiver fora do ar, as mensagens esperam no banco, na ordem.
- **Envelope:** o outbox embrulha a mensagem do domínio em `{id, type, source, time, data}` ([contracts](contracts/README.md#envelope)). `source` vem de `new OutboxMessageBus(db, broker, { source: '<serviço>' })` (obrigatório). Os handlers recebem `(data, envelope)`.
- **Migração:** mensagens no formato antigo (sem `data`) que tenham ficado no outbox ou nas filas vão para a DLQ. Em dev, `docker compose down -v`.
- **Idempotência:** o consumidor guarda o `id` na tabela `inbox` depois de tratar e ignora repetidas. Entradas com mais de 30 dias são apagadas na subida.
- **Retry e DLQ:** se o handler falha, a mensagem vai para `<fila>.retry`, volta depois de `MESSAGE_RETRY_DELAY_MS` (padrão 5000) e é tentada até `MESSAGE_MAX_ATTEMPTS` (padrão 5) vezes. Depois vai para `<fila>.dlq`, com os headers `x-attempt` e `x-error`. Para reprocessar, use "Move messages" da DLQ para a fila na UI do RabbitMQ (requer o plugin shovel).
- **Logs do consumo:** cada mensagem recebida, repetida ou com falha gera uma linha `[<fila>] <type> id=… source=… attempt=n/MAX`. Ex.: `docker compose logs payment | grep 'falhou'`.
- **Trade-offs:**
  - A entrega é *pelo menos uma vez*. A inbox é gravada depois do handler, fora da transação dele (os handlers são assíncronos). Se o serviço cair entre as duas coisas, a mensagem é tratada de novo, então os handlers continuam idempotentes.
  - Uma mensagem em retry perde a ordem em relação às seguintes.
  - `transaction()` exige uma função síncrona (node:sqlite com uma conexão só: um `await` deixaria outras requisições escreverem dentro da transação).
  - Com várias instâncias no mesmo banco, dois relays podem enviar a mesma linha. A inbox do consumidor descarta a repetida.
- Alternativas: CDC (Debezium) lendo o log do banco, em vez do relay por polling; ou atraso exponencial com o plugin `rabbitmq-delayed-message-exchange`, em vez da fila de retry com TTL fixo.
