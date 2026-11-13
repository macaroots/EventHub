# Título: SQLite no protótipo, banco relacional em produção
Número do ADR: 000
Data: 2026-11-07
Responsável: Renato
Status: Aceito

## Contexto
Cada serviço é dono dos seus dados e não lê o banco de outro ([ADR 001](001-comunicacao-assincrona.md)). Na fase de protótipo, o que mais importa é:
- subir o sistema e rodar os testes sem infraestrutura extra;
- mudar o modelo com frequência sem pagar caro por migrações.

Em produção, as necessidades dos serviços atuais são parecidas:
- gravar o estado e as mensagens na mesma transação (outbox);
- garantir invariantes sob concorrência, como a capacidade da atividade ([ADR 008](008-controle-de-vagas-no-credenciamento.md));
- ter unicidade (username, uma presença por inscrição) e consultas por índice;
- rodar com várias instâncias por serviço ([ADR 014](014-varias-instancias-por-servico.md)).

## Decisão
- **Protótipo:** SQLite (`node:sqlite`), um arquivo por serviço, num volume do contêiner. Os repositórios ficam atrás de uma interface (`shared/infrastructure`), e o domínio não conhece o banco.
- **Produção:** a persistência é escolhida por serviço, antes de ele ir para produção. O padrão é **PostgreSQL**, com um banco (ou schema e usuário) por serviço. Outro tipo de banco precisa de ADR próprio.
- **Expectativa por serviço:**

| Serviço | Persistência esperada | Por quê |
|---|---|---|
| `identity` | Postgres | Unicidade de username; ou um IdP externo |
| `secretariat` | Postgres | Evento e atividades com transação; leitura pública atrás de cache ([ADR 015](015-catalogo-publico.md)) |
| `registration` | Postgres | Capacidade sob concorrência, lock otimista, trigger de segurança e outbox |
| `payment` | Postgres | Estado da cobrança e outbox na mesma transação |
| `report` (planejado) | Postgres com JSONB; data warehouse se crescer | Log só de inserção, consultas agregadas ([ADR 005](005-relatorios.md)) |
| `certificate` (planejado) | Postgres + armazenamento de objetos (S3 ou similar) para os PDFs | Metadados e código de validação no banco, arquivos fora dele ([ADR 003](003-certificados.md)) |
| `notification` (planejado) | Postgres, ou nenhum | Só o registro de envios, para idempotência ([ADR 004](004-notificacoes.md)) |

## Justificativa
- O SQLite não precisa de servidor, então o `docker compose up` e os testes continuam rápidos e o modelo pode mudar sem custo.
- Todos os serviços atuais são transacionais e relacionais. Um só motor (Postgres) reduz o que é preciso operar e conhecer.
- O Postgres tem transações ACID, advisory locks, `SKIP LOCKED`, JSONB e réplicas de leitura, e existe gerenciado nas nuvens principais.
- Decidir por serviço mantém a autonomia dos contextos: um serviço com outro perfil (por exemplo, relatórios) não fica preso à escolha dos outros.

## Alternativas Consideradas
- **Postgres desde o início:** evita a migração depois, mas pesa no ambiente de desenvolvimento e nos testes enquanto o modelo ainda muda muito.
- **Dados em memória (como o `identity` começou):** mais simples ainda, mas perde tudo ao reiniciar e não testa transações.
- **MySQL:** atenderia, mas o Postgres tem os recursos usados no outbox e na concorrência (advisory locks, `SKIP LOCKED`, JSONB) mais maduros.
- **NoSQL (MongoDB, DynamoDB):** escala a escrita, mas complica a transação que muda vaga e fila juntas e o outbox na mesma transação.

## Consequências
- **Cada serviço com dados vai precisar migrar.** O código usa recursos do SQLite (tabelas `STRICT`, triggers e `transaction()` síncrona), que serão reescritos no adaptador Postgres ([ADR 014](014-varias-instancias-por-servico.md)).
- Enquanto estiver no SQLite, cada serviço roda com uma instância só.
- Os testes de domínio não mudam. Os testes de repositório e de integração passam a rodar contra um Postgres em contêiner.
- Em produção, vêm backup, migrações de schema e pool de conexões.

## Referências
- [008-controle-de-vagas-no-credenciamento.md](008-controle-de-vagas-no-credenciamento.md)
- [014-varias-instancias-por-servico.md](014-varias-instancias-por-servico.md)
- [Documentação do PostgreSQL](https://www.postgresql.org/docs/)
