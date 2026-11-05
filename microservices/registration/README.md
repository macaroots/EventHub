## Registration: inscrições

Exige login; o usuário vem do token.

| Rota | Descrição |
|------|-----------|
| `POST /registrations` `{activityId}` | Inscreve o usuário logado. Só em evento `published`. Retorna `{id, status, requirements, reasons, payment}`. Leitura também traz `waitlistPosition` (1, 2... ou `null`). |
| `GET /registrations` | Admin vê todas; os demais, só as próprias. |
| `GET /registrations/:id` | Dono, organizador do evento ou admin. |
| `POST /registrations/:id/cancel` `{reason?}` | Dono, organizador do evento ou admin. |
| `GET /activities/:id/registrations` | Organizador/admin: `{activity (com ocupação), event, registrations}`. |
| `POST /registrations/:id/requirements/:requirementId/fulfill` | Organizador/admin. Pendências de elegibilidade (`age verification`). |
| `GET /activities/:id/waitlist` | Ordem da fila de espera: só os `registrationId`. Qualquer usuário logado. Usada pelo BFF ([ADR 009](../../docs/adrs/posicao-na-fila-de-espera.md)). |
| `GET /activities` | Projeção das atividades. |

`Activity` e o evento (`status`, `organizers`) são projeções das mensagens da secretaria (que publica `EventUpdated` ao mudar organizers); `Participant {id, username}` é projeção de `UserCreated`/`UserUpdated` do identity (upsert, idempotente). O domínio só conhece o `userId`; o participante só entra na listagem.

### Regras de inscrição ([ADR 008](../../docs/adrs/vaga-e-pagamento-como-status.md))

- A `Activity` é a única porta de escrita: cria a `Registration` (factory), muda o status e promove a fila. O repositório de `Registration` só lê.
- Status: `pending` (pendências de elegibilidade) → `awaiting_payment` (vaga reservada, `PaymentRequested`) → `confirmed`; sem vaga → `waitlisted`; `canceled`. `pending`, `awaiting_payment` e `confirmed` ocupam vaga.
- Ordem em `register`: regras de elegibilidade → vaga → pagamento. Quem está na fila não é cobrado; só é cobrado quem tem vaga e já é elegível.
- `requirements` são só elegibilidade: `minimumAge` → `age verification`, aprovada pelo organizador (não há data de nascimento na projeção). Podem ser resolvidas na fila.
- Uma regra só avalia e retorna `{deny: motivo}` | `{require: pendência}`. Exceção numa regra é bug, não indeferimento.
- `PaymentConfirmed` confirma se o `paymentId` for o da reserva atual; senão, é ignorado. `PaymentDenied` cancela.
- Ordem da fila: `createdAt`; empate no mesmo milissegundo, ordem de inserção.
- Liberou vaga (cancelamento, pagamento recusado, expiração, aumento de capacidade) → promove o primeiro da fila (`RegistrationPromoted`, e então o pagamento ou a confirmação). Cancelamento do evento não promove.
- A reserva expira em `PAYMENT_WINDOW_MINUTES` (padrão 30). Um job verifica a cada minuto.
- Reduzir a capacidade não despeja ninguém, só impede novas vagas. Abaixo dos confirmados, é recusado.

### Capacidade sob concorrência

- Lock otimista: `activities.version`. Se outra escrita gravou depois da leitura, o app service recarrega e refaz (até 20 vezes, com espera aleatória). Mensagens só saem depois do commit.
- Triggers no SQLite recusam (`Full occupation`) a entrada em status que ocupa vaga sem vaga livre: rede de segurança contra bugs e outras instâncias.
- SQLite em WAL com `busy_timeout`, para várias conexões.
- `test/concurrency.test.js`: 8 threads, cada uma com sua conexão, fazem 200 inscrições em 30 vagas; a ocupação fica em 30.
- Alternativa para uma disputa enorme numa só atividade: contador atômico (`UPDATE ... WHERE seatsTaken < capacity`), que tira a regra do domínio.

Persistência: SQLite em `data/registration.db` (volume `registration-data`). A `Activity` é carregada e salva junto com as inscrições, numa transação. As projeções (atividades, eventos, participantes) também ficam no banco, porque as mensagens que as criaram já foram consumidas e não chegam de novo após um restart.

Gestão: organizers vêm na projeção do evento, então a autorização é local (sem chamada à secretaria), mas eventualmente consistente. Alternativa: o BFF perguntar à secretaria e o registration confiar no BFF.

Limitações: pagamento feito depois de perder a reserva é ignorado, sem estorno; mensagens saem depois do commit, sem outbox.