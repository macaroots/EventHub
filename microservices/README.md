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

- Uma única imagem ([Dockerfile](Dockerfile)) para todos os serviços, escolhida via `--build-arg SERVICE=<pasta>`. Build context é `microservices/` para incluir `shared/`, mantendo os imports relativos (`../../shared/...`).
- Dentro dos containers todos escutam na 3000; `RABBITMQ_URL=amqp://rabbitmq`.
- AMQP (5672) não é exposto no host, para não conflitar com outro RabbitMQ local. Para rodar um serviço fora do Docker contra este broker, adicione `"5672:5672"` em `ports` do `rabbitmq`.

- Sem hot-reload: mudanças de código exigem `docker compose up -d --build`.
