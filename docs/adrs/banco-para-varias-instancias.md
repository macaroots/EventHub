# Título: Banco que permite várias instâncias por serviço
Número do ADR: 014
Data: 2026-11-07
Responsável: Renato
Status: Proposto

## Contexto
Cada serviço guarda os dados num SQLite próprio (`node:sqlite`), num volume local do contêiner. Isso basta para o protótipo, mas prende cada serviço com dados a uma instância só:
- o SQLite em WAL só funciona entre processos do mesmo host; em sistema de arquivos de rede ele corrompe ou trava;
- sem réplicas, não há escala horizontal nem alta disponibilidade, e todo deploy derruba o serviço;
- o pico da abertura das inscrições cai inteiro numa instância do `registration`.

Parte do código já aceita várias instâncias:
- lock otimista (`version` da `Activity`) e trigger de capacidade no banco ([ADR 008](vaga-e-pagamento-como-status.md));
- inbox com o `id` da mensagem: uma mensagem repetida entre instâncias é ignorada;
- o RabbitMQ distribui uma fila entre consumidores concorrentes.

Outra parte supõe uma instância só:
- **relay do outbox:** envia em ordem de `seq`. Com dois relays, a mesma linha sairia duas vezes e a ordem se perderia;
- **expiração das reservas:** o `setInterval` do `registration` rodaria em todas as instâncias. O lock otimista evita o erro, mas o trabalho se repete e gera conflitos;
- **`transaction()` síncrona:** depende da conexão única do `node:sqlite`.

## Decisão
- **Postgres**, com um banco (ou schema e usuário) por serviço. A regra continua: ninguém lê o banco de outro serviço.
- **Migrar um serviço por vez, quando ele atingir o gatilho**, começando pelo `registration`. Até lá, SQLite com uma instância, crescendo na vertical.
- Em `shared/`:
  - um adaptador Postgres com a mesma interface dos repositórios;
  - `transaction()` assíncrona, com um cliente do pool por transação.
- **Relay do outbox:** um só ativo por serviço, eleito por `pg_try_advisory_lock`. Isso preserva a ordem. As outras instâncias ficam de reserva e assumem se ele cair.
- **Tarefas periódicas** (expiração): mesmo esquema, com um advisory lock por tarefa.
- **Capacidade:** lock otimista no domínio, com o trigger reescrito em PL/pgSQL como rede de segurança.

**Gatilhos:**
- CPU ou latência de uma instância saturada num pico medido;
- exigência de deploy sem parada ou de tolerância a falha de uma instância.

## Justificativa
- O Postgres tem transações, `SKIP LOCKED`, advisory locks e réplicas de leitura, e existe como serviço gerenciado nas nuvens principais.
- O modelo continua relacional, então o domínio e as invariantes do [ADR 008](vaga-e-pagamento-como-status.md) não mudam.
- Migrar por gatilho evita operar Postgres em serviços que não precisam, como `identity` e `payment`, com pouca carga.

## Alternativas Consideradas
- **SQLite replicado (LiteFS, rqlite, Litestream):** replica a leitura, mas mantém um escritor só. Não resolve o pico de escrita no `registration`.
- **Um Postgres compartilhado, com um schema por serviço:** é uma forma de implantar esta decisão, mais barata, desde que cada serviço tenha usuário próprio sem acesso aos schemas dos outros. O preço é que um pico num serviço afeta os outros.
- **NoSQL (DynamoDB, MongoDB):** escala a escrita, mas perde a transação que muda vaga e fila juntas e obriga a reescrever as invariantes.
- **Particionar por atividade (shard por `activityId`):** só faria sentido depois do Postgres, e com evidência de que um banco só não aguenta.
- **Continuar com uma instância e crescer na vertical:** vale até o gatilho, e é a situação atual.

## Consequências
- `transaction()` muda de contrato (de síncrona para assíncrona), e os repositórios e os app services que a usam precisam de ajuste.
- Os testes de integração passam a precisar de um Postgres (contêiner). Os testes de domínio não mudam.
- Mais infraestrutura para operar: backup, migrações de schema e pool de conexões.
- Um relay só por serviço limita a vazão do envio. Se pesar, particionar o outbox por chave (por exemplo, `activityId`) e manter a ordem só dentro de cada chave.
- Os caches em memória do BFF continuam por instância ([ADR 009](posicao-na-fila-de-espera.md)). Este ADR não cobre isso.

## Referências
- [vaga-e-pagamento-como-status.md](vaga-e-pagamento-como-status.md)
- [fila-de-acesso.md](fila-de-acesso.md)
- [../../microservices/README.md](../../microservices/README.md#entrega-das-mensagens)
