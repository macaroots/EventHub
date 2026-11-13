# Título: Várias instâncias por serviço
Número do ADR: 014
Data: 2026-11-07
Responsável: Renato
Status: Proposto

## Contexto
No protótipo, cada serviço guarda os dados num SQLite num volume local ([ADR 000](000-escolha-banco.md)). Isso prende cada serviço com dados a uma instância só:
- o SQLite em WAL só funciona entre processos do mesmo host;
- sem réplicas, não há escala horizontal nem alta disponibilidade, e todo deploy derruba o serviço;
- o pico da abertura das inscrições cai inteiro numa instância do `registration`.

O [ADR 000](000-escolha-banco.md) define o Postgres para produção. Trocar o banco, porém, não basta.

**O que já aceita várias instâncias:**
- lock otimista (`version` da `Activity`) e trigger de capacidade no banco ([ADR 008](008-controle-de-vagas-no-credenciamento.md));
- inbox com o `id` da mensagem: uma mensagem repetida entre instâncias é ignorada;
- o RabbitMQ distribui uma fila entre consumidores concorrentes.

**O que supõe uma instância só:**
- **relay do outbox:** envia em ordem de `seq`. Com dois relays, a mesma linha sairia duas vezes e a ordem se perderia;
- **expiração das reservas:** o `setInterval` do `registration` rodaria em todas as instâncias. O lock otimista evita o erro, mas o trabalho se repete e gera conflitos;
- **`transaction()` síncrona:** depende da conexão única do `node:sqlite`;
- **caches em memória do BFF:** um por instância ([ADR 009](009-posicao-na-fila-de-espera.md)).

## Decisão
Ao migrar um serviço para o Postgres ([ADR 000](000-escolha-banco.md)), ele passa a aceitar várias instâncias:
- **`shared/`:**
  - adaptador Postgres com a mesma interface dos repositórios;
  - `transaction()` assíncrona, com um cliente do pool por transação.
- **Relay do outbox:** um só ativo por serviço, eleito por `pg_try_advisory_lock`. Isso preserva a ordem. As outras instâncias ficam de reserva e assumem se ele cair.
- **Tarefas periódicas** (expiração): mesmo esquema, com um advisory lock por tarefa.
- **Capacidade:** lock otimista no domínio, com o trigger reescrito em PL/pgSQL como rede de segurança.
- **Caches do BFF:** continuam por instância. Se a carga somada pesar no `registration`, passam a ficar num Redis compartilhado.
- **Ordem de migração:** `registration` primeiro (core e pico de escrita), depois `secretariat`, `payment` e `identity`.

## Justificativa
- Advisory locks dão eleição de líder sem infraestrutura nova (ZooKeeper, etcd): o próprio banco do serviço decide quem roda o relay e as tarefas.
- Manter um relay só preserva a ordem das mensagens por serviço, que hoje já é garantida e da qual os consumidores dependem (por exemplo, `EventPublished` antes de `EventCanceled`).
- O domínio e as invariantes do [ADR 008](008-controle-de-vagas-no-credenciamento.md) não mudam: só a infraestrutura.

## Alternativas Consideradas
- **Relay em todas as instâncias com `SELECT ... FOR UPDATE SKIP LOCKED`:** dá mais vazão, mas perde a ordem entre as linhas enviadas em paralelo.
- **Relay como processo separado (CDC, Debezium):** lê o log do Postgres e publica sem tocar no serviço. É robusto, mas é mais um componente para operar.
- **Particionar por atividade (shard por `activityId`):** só com evidência de que um banco só não aguenta.
- **Continuar com uma instância e crescer na vertical:** é a situação do protótipo e não dá alta disponibilidade.

## Consequências
- `transaction()` muda de contrato (de síncrona para assíncrona), e os repositórios e os app services que a usam precisam de ajuste.
- Um relay só por serviço limita a vazão do envio. Se pesar, particionar o outbox por chave (por exemplo, `activityId`) e manter a ordem só dentro de cada chave.
- Os testes de repositório passam a rodar contra um Postgres em contêiner, e é preciso um teste com duas instâncias (relay e expiração).
- Com várias instâncias, entra um balanceador na frente de cada serviço (ou o API gateway).

## Referências
- [000-escolha-banco.md](000-escolha-banco.md)
- [008-controle-de-vagas-no-credenciamento.md](008-controle-de-vagas-no-credenciamento.md)
- [009-posicao-na-fila-de-espera.md](009-posicao-na-fila-de-espera.md)
- [010-fila-de-acesso.md](010-fila-de-acesso.md)
- [../../microservices/README.md](../../microservices/README.md#entrega-das-mensagens)
