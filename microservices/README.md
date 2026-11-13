# Microservices

## Portas e rede

- Só o `web` (3000) e o `certificate` (3005, link público de validação) publicam porta no `docker-compose.yml`. Os outros ficam na rede interna ([ADR 007](../docs/adrs/007-entrada-unica-sem-api-gateway.md)) e só publicam no [docker-compose.dev.yml](docker-compose.dev.yml).
- Dentro do contêiner, os serviços Node e o payment escutam na 3000 (`PORT`); entre serviços, o endereço é `http://<serviço>:3000`. `certificate` e `reports` escutam em 3005 e 3006.
- O build context é `microservices/`, para incluir `shared/` com imports relativos (`../../shared/...`).
- AMQP (5672) não é exposto no host. Para rodar um serviço fora do Docker contra este broker, adicione `"5672:5672"` ao `rabbitmq`.

## Persistência

- Um banco por serviço: SQLite em `<serviço>/data/` (volume `<serviço>-data`), exceto o identity, em Postgres (`identity-db`, migrações na subida). [ADR 000](../docs/adrs/000-escolha-banco.md).
- O que vem de outro serviço chega por mensagem e vira projeção local.
- Mudou o schema de um SQLite? `docker compose down -v` apaga os bancos.

## Autenticação

- `.env` (fora do git, ver [.env.example](.env.example)): `JWT_SECRET`, `INTERNAL_API_TOKEN` e `IDENTITY_DB_PASSWORD`. Sem eles, o identity não inicia.
- O identity emite JWT HS256 com `{userId, username, email}` (validade `JWT_EXPIRES_IN`, 1h no compose). Os demais validam com o mesmo `JWT_SECRET` ([shared/auth/jwt.js](shared/auth/jwt.js)).
- Sem papel de admin no token: quem gerencia um evento é quem está nos `organizers` dele.
- Trade-off: com HS256, quem verifica tokens também consegue emiti-los. Alternativa: RS256.

## API (Swagger)

- Serviços Node: contrato escrito à mão em `<serviço>/src/openapi.yaml`, servido em `/openapi.yaml` e `/docs`. O `test/openapi.test.js` de cada um falha se houver rota sem documentação ou vice-versa.
- Serviços Python: contrato gerado pelo FastAPI em `/openapi.json` e `/docs`.
- No Swagger, "Authorize" recebe o `token` de `POST /auth/login` do identity.

## Entrega das mensagens

Contrato de cada mensagem, quem produz e quem consome: [contracts/README.md](contracts/README.md).

Nos serviços Node, [OutboxMessageBus](shared/messaging/outbox-message-bus.js) fica na frente do [RabbitMqMessageBus](shared/messaging/rabbitmq-message-bus.js):

- **Outbox:** `messageBus.transaction(() => { repo.update(x); messageBus.publish(m); })` grava estado e mensagem juntos. Um relay envia depois do commit (a cada 1 s) e só apaga quando o broker confirma. Com o broker fora do ar, as mensagens esperam no banco, na ordem.
- **Envelope:** `{id, type, source, time, data}`. Os handlers recebem `(data, envelope)`.
- **Inbox:** o consumidor guarda o `id` tratado e ignora repetidas (entrega *pelo menos uma vez*; handlers idempotentes).
- **Retry e DLQ:** falha no handler → `<fila>.retry` (`MESSAGE_RETRY_DELAY_MS`, padrão 5000), até `MESSAGE_MAX_ATTEMPTS` (padrão 5); depois `<fila>.dlq`. Para reprocessar, mova as mensagens da DLQ para a fila na UI do RabbitMQ.
- **Logs:** cada mensagem gera uma linha `[<fila>] <type> id=… attempt=n/MAX` (ex.: `docker compose logs payment | grep falhou`).
- Limitações: mensagem em retry perde a ordem; `transaction()` exige função síncrona (node:sqlite com uma conexão).

## Web (BFF)

`web` renderiza as telas no servidor (Express + EJS) e repassa o JWT do cookie `token` (httpOnly) como `Authorization: Bearer`. Um client por serviço em `web/src/clients/`, um router por feature em `web/src/routes/`. Telas: [web/README.md](web/README.md).
