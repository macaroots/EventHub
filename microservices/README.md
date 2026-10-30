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
- Dentro dos containers todos escutam na 3000; `RABBITMQ_URL=amqp://rabbitmq`.
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
