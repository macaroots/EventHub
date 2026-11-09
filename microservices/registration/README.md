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
| `GET /activities/:id/waitlist` | Ordem da fila de espera: só os `registrationId`. Qualquer usuário logado. Usada pelo BFF ([ADR 009](../../docs/adrs/009-posicao-na-fila-de-espera.md)). |
| `GET /activities/:id/checkin` | Organizador/admin: código, confirmados, presenças e lista. |
| `POST /activities/:id/checkin/open` / `close` | Organizador/admin: abre (gera código novo, o anterior deixa de valer) ou fecha. |
| `POST /activities/:id/checkin` `{code}` | Participante confirmado informa o código mostrado na sala. |
| `POST /registrations/:id/checkin` | Organizador/admin marca a presença na mão. |

Erros: `DomainError` (regra de negócio) → 400; `NotFoundError` 404; `ForbiddenError` 403; `ConcurrencyError` (retentativas esgotadas) 409. Qualquer outro erro é falha interna → 500, só logado, sem a mensagem na resposta. Regra nova deve lançar `DomainError` (ou subclasse), senão vira 500.

`Activity` (nome, horário, capacidade, preço, regras) e o evento (`status`, `organizers`) são cópias imutáveis criadas uma vez pelo `EventPublished` ([ADR 011](../../docs/adrs/011-evento-imutavel-apos-publicacao.md)); depois, só `EventCanceled` (cancela as inscrições), `EventEnded` (certificados) e `EventOrganizersChanged` os alteram; `Participant {id, name}` é projeção de `UserRegistered`/`UserUpdated` do identity (upsert, idempotente). O domínio só conhece o `userId`; o participante só entra na listagem.

### Regras de inscrição ([ADR 008](../../docs/adrs/008-vaga-e-pagamento-como-status.md))

- A `Activity` é a única porta de escrita: cria a `Registration` (factory), muda o status e promove a fila. O repositório de `Registration` só lê.
- Status: `pending` (pendências de elegibilidade) → `awaiting_payment` (vaga reservada, `PaymentRequested`) → `confirmed`; sem vaga → `waitlisted`; `canceled`. `pending`, `awaiting_payment` e `confirmed` ocupam vaga.
- Ordem em `register`: lotada com confirmados → nega (`Full occupation`); regras de elegibilidade → vaga → pagamento. Quem está na fila não é cobrado; só é cobrado quem tem vaga e já é elegível.
- `requirements` são só elegibilidade: `minimumAge` → `age verification`, aprovada pelo organizador (não há data de nascimento na projeção). Podem ser resolvidas na fila.
- Uma regra só avalia e retorna `{deny: motivo}` | `{require: pendência}`. Exceção numa regra é bug, não indeferimento.
- `PaymentConfirmed` confirma se o `paymentId` for o da reserva atual; senão, é ignorado. `PaymentDenied` cancela.
- Ordem da fila: `createdAt`; empate no mesmo milissegundo, ordem de inserção.
- Liberou vaga (cancelamento, pagamento recusado, expiração) → promove o primeiro da fila (`RegistrationPromoted`, e então o pagamento ou a confirmação). Cancelamento do evento não promove.
- Lotou com confirmados → a fila é cancelada (`Full occupation`, `RegistrationCanceled`): não há mais o que esperar. Trade-off: se um confirmado cancelar depois, a vaga reabre para novas inscrições, não para quem estava na fila. Alternativa: manter a fila até o evento (o confirmado ainda pode desistir).
- A reserva expira em `PAYMENT_WINDOW_MINUTES` (padrão 30). Um job verifica a cada minuto.

### Check-in ([ADR 012](../../docs/adrs/012-forma-do-checkin.md))

- Presença por atividade, só de inscrição `confirmed`. `attendances.registrationId` é único: repetir devolve a presença existente (`alreadyCheckedIn: true`) e não publica de novo.
- Código de 6 caracteres sem ambíguos (0/O, 1/I/L), sem diferença de maiúsculas. Só vale com o check-in aberto e o evento publicado.
- Primeira presença publica `AttendanceRegistered` (base para certificados, RN06). Inscrição cancelada depois mantém a presença.
- `CheckIn` e `Attendance` ficam fora da `Activity`: não disputam o lock das inscrições. A inscrição é lida no momento do check-in.
- `GET /registrations/:id` traz `attendance`; `GET /activities/:id/registrations` traz `activity.present` (comparecimento, RF11).
- Limitações: sem janela de horário (o organizador abre e fecha), sem desfazer presença e um código repassado vale enquanto aquela abertura durar. Alternativa: código rotativo (TOTP).

### Certificados ([ADR 003](../../docs/adrs/003-certificados.md))

- `EventEnded` (organizador encerra na secretaria) → o evento fica `ended` e sai um `CertificateRequested` por participante, na mesma transação. Encerrado, não há mais inscrição nem check-in: corrigir presenças antes de encerrar.
- Quem decide o direito é o [CertificatePolicy](src/domain/certificate-policy.js). Critério provisório: um certificado por evento para quem fez check-in em ao menos uma atividade (mesmo se cancelou a inscrição depois), listando as atividades com presença. Alternativas: presença mínima (ex.: X% das atividades inscritas) ou carga horária mínima.
- Mensagem: `{requestId (= eventId:userId, para idempotência), eventId, userId, participantName, eventName, activities: [{activityId, name, workload, date}], totalWorkload}`.
  - `workload`: duração da atividade em horas (`endsAt - startsAt`); `null` sem horário (conta 0 no `totalWorkload`).
  - `date`: dia de `startsAt` ou, sem horário, do check-in.
  - `participantName` é o `name` do identity.
- Idempotente: evento já encerrado, cancelado ou desconhecido não pede de novo.
- `GET /registrations[/:id]` traz `event.status`; `ended` com `attendance` = certificado solicitado.
- Limitações: sem reemissão (presença não se desfaz) e sem retorno do serviço de certificados (link do PDF). A projeção da atividade ganhou `startsAt`/`endsAt` (colunas adicionadas na subida); atividades publicadas antes ficam sem horário.

### Capacidade sob concorrência

- Lock otimista: `activities.version`. Se outra escrita gravou depois da leitura, o app service recarrega e refaz (até 20 vezes, backoff exponencial com jitter até 200 ms; esgotou → erro `changed concurrently`, sem passar da capacidade). Mensagens só saem depois do commit.
- Triggers no SQLite recusam (`Full occupation`) a entrada em status que ocupa vaga sem vaga livre: rede de segurança contra bugs e outras instâncias.
- SQLite em WAL com `busy_timeout`, para várias conexões.
- `test/concurrency.test.js`: 8 threads, cada uma com sua conexão, fazem 200 inscrições em 30 vagas; a ocupação fica em 30.
- Alternativa para uma disputa enorme numa só atividade: contador atômico (`UPDATE ... WHERE seatsTaken < capacity`), que tira a regra do domínio.

Persistência: SQLite em `data/registration.db` (volume `registration-data`). A `Activity` é carregada e salva junto com as inscrições, numa transação. As projeções (atividades, eventos, participantes) também ficam no banco, porque as mensagens que as criaram já foram consumidas e não chegam de novo após um restart.

Gestão: organizers vêm na projeção do evento, então a autorização é local (sem chamada à secretaria), mas eventualmente consistente. Alternativa: o BFF perguntar à secretaria e o registration confiar no BFF.

Limitações: pagamento feito depois de perder a reserva é ignorado, sem estorno; mensagens saem depois do commit, sem outbox.