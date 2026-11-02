## Registration: inscrições

Exige login; o usuário vem do token.

| Rota | Descrição |
|------|-----------|
| `POST /registrations` `{activityId}` | Inscreve o usuário logado. Só em evento `published`. Retorna `{id, status, requirements, reasons}`. |
| `GET /registrations` | Admin vê todas; os demais, só as próprias. |
| `GET /activities` | Projeção das atividades. |

`Activity` e o status do evento são projeções das mensagens da secretaria (upsert, idempotente).

### Regras de inscrição

- `Activity.register(user)` cria a `Registration` (o aggregate é a factory das suas entidades).
- A regra só avalia e retorna `{deny: motivo}` | `{require: pendência}`; quem altera a `Registration` é o aggregate. Exceção numa regra é bug, não indeferimento.
- A `Registration` só emite mensagens (`pullMessages`) depois que todas as regras rodaram: se uma regra nega, nenhuma cobrança é pedida.
- Cada pendência tem `id`; mensagens de outros contextos a resolvem (`PaymentConfirmed.paymentId` = id da pendência). Sem pendências → `confirmed`. `PaymentDenied` cancela.
- `CapacityRule` é sempre a primeira: lotado com confirmados → nega; lotado com pendentes → `wait list`.
- `payment` (quantas quiser: taxa, ingresso...) → `PaymentRequested` cada; `minimumAge` → pendência `age verification` (não há data de nascimento na projeção de usuário).

Limitações: repositórios em memória; `wait list` e `age verification` ainda não têm quem as resolva; inscrição cancelada não estorna pagamento.
