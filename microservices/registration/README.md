## Registration: inscrições

Exige login; o usuário vem do token.

| Rota | Descrição |
|------|-----------|
| `POST /registrations` `{activityId}` | Inscreve o usuário logado. Só em evento `published`. Retorna `{id, status, requirements, reasons}`. |
| `GET /registrations` | Admin vê todas; os demais, só as próprias. |
| `GET /registrations/:id` | Dono, organizador do evento ou admin. |
| `POST /registrations/:id/cancel` `{reason?}` | Dono, organizador do evento ou admin. |
| `GET /activities/:id/registrations` | Organizador/admin: `{activity (com ocupação), event, registrations}`. |
| `POST /registrations/:id/requirements/:requirementId/fulfill` | Organizador/admin. Só pendências manuais (`age verification`); `payment` vem do payment. |
| `GET /activities` | Projeção das atividades. |

`Activity` e o evento (`status`, `organizers`) são projeções das mensagens da secretaria (que publica `EventUpdated` ao mudar organizers); `Participant {id, username}` é projeção de `UserCreated`/`UserUpdated` do identity (upsert, idempotente). O domínio só conhece o `userId`; o participante só entra na listagem.

### Regras de inscrição

- `Activity.register(userId)` cria a `Registration` (o aggregate é a factory das suas entidades).
- A regra só avalia e retorna `{deny: motivo}` | `{require: pendência}`; quem altera a `Registration` é o aggregate. Exceção numa regra é bug, não indeferimento.
- A `Registration` só emite mensagens (`pullMessages`) depois que todas as regras rodaram: se uma regra nega, nenhuma cobrança é pedida.
- Cada pendência tem `id`; mensagens de outros contextos a resolvem (`PaymentConfirmed.paymentId` = id da pendência). Sem pendências → `confirmed`. `PaymentDenied` cancela.
- Ordem em `register`: vaga → regras de elegibilidade → preço.
- Vaga: lotado com confirmados → nega; lotado com pendentes → `wait list`.
- `price > 0` → pendência `payment` e `PaymentRequested`.
- Capacidade: confirmados nunca passam de `capacity`. Toda confirmação (pagamento, pendência manual) passa por `Activity.fulfill`; se não houver vaga confirmada, a inscrição ganha a pendência `wait list` em vez de confirmar (ex.: capacidade reduzida com pendentes). Um trigger no SQLite rejeita (`Full occupation`) qualquer gravação que passe do limite, mesmo fora do domínio ou com várias instâncias. Num mesmo processo não há corrida: carregar, inscrever e salvar é síncrono.
- Regras de elegibilidade: `minimumAge` → pendência `age verification` (não há data de nascimento na projeção de usuário).

Persistência: SQLite em `data/registration.db` (volume `registration-data`). A `Activity` é carregada e salva junto com as inscrições, numa transação. As projeções (atividades, eventos, participantes) também ficam no banco, porque as mensagens que as criaram já foram consumidas e não chegam de novo após um restart.

Gestão: organizers vêm na projeção do evento, então a autorização é local (sem chamada à secretaria), mas eventualmente consistente. Alternativa: o BFF perguntar à secretaria e o registration confiar no BFF.

Limitações: `wait list` ainda não tem quem a resolva; inscrição cancelada não estorna pagamento; eventos projetados antes de existir `organizers` ficam sem organizadores até o próximo `EventUpdated` (salve o evento de novo).
