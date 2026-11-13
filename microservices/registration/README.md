# Registration: inscrições e check-in

Exige login; o usuário vem do token.

| Rota | Descrição |
|------|-----------|
| `POST /registrations` `{activityId}` | Inscreve o usuário logado (só em evento `published`). |
| `GET /registrations[/:id]` | Inscrições do usuário; uma inscrição também para o organizador do evento. |
| `POST /registrations/:id/cancel` `{reason?}` | Dono ou organizador. |
| `GET /activities/:id/registrations` | Organizador: atividade com ocupação, evento e inscrições. |
| `POST /registrations/:id/requirements/:requirementId/fulfill` | Organizador aprova uma pendência (`age verification`). |
| `GET /activities/:id/waitlist` | Ordem da fila de espera ([ADR 004](../../docs/adrs/004-atualizacao-posicao-na-fila.md)). |
| `GET /activities/:id/checkin`, `POST .../checkin/open`, `.../close` | Organizador: código, presenças; abrir gera código novo. |
| `POST /activities/:id/checkin` `{code}` | Participante confirmado informa o código mostrado na sala. |
| `POST /registrations/:id/checkin` | Organizador marca a presença na mão. |

Erros: regra de negócio 400, 403, 404, `ConcurrencyError` 409; qualquer outro é 500 (só logado). Regra nova deve lançar `DomainError`.

## Regras de inscrição ([ADR 003](../../docs/adrs/003-controle-de-vagas-no-credenciamento.md))

- A `Activity` é a única porta de escrita: cria a `Registration`, muda o status e promove a fila.
- Status: `pending` (pendência de elegibilidade) → `awaiting_payment` (vaga reservada, `PaymentRequested`) → `confirmed`; sem vaga → `waitlisted`; `canceled`. `pending`, `awaiting_payment` e `confirmed` ocupam vaga.
- `PaymentConfirmed` só confirma se o `paymentId` for o da reserva atual. `PaymentDenied` cancela.
- Liberou vaga → promove o primeiro da fila (`RegistrationPromoted`). Lotou com confirmados → a fila é cancelada.
- A reserva expira em `PAYMENT_WINDOW_MINUTES` (padrão 2, para demonstração); um job verifica a cada minuto.
- Evento e atividades são cópias imutáveis do `EventPublished`; `Participant` é projeção de `UserRegistered`. A autorização do organizador é local.

## Check-in ([ADR 006](../../docs/adrs/006-forma-do-checkin.md))

- Só inscrição `confirmed`, uma presença por inscrição. Código de 6 caracteres sem ambíguos, válido com o check-in aberto.
- A primeira presença publica `AttendanceRegistered`.

## Certificados ([ADR 008](../../docs/adrs/008-certificados.md))

Ao terminar o evento, quem decide o direito ao certificado é o credenciamento.

- Ouve `EventEnded` → emite um `CertificateRequested` por participante com presença em ao menos uma atividade ([CertificatePolicy](src/domain/certificate-policy.js)).

## Concorrência

- Lock otimista (`activities.version`): o app service recarrega e refaz até 20 vezes. Triggers no SQLite recusam vaga excedente.
- [test/concurrency.test.js](test/concurrency.test.js): 8 conexões, 200 inscrições, 30 vagas → ocupação 30.

Limitação: pagamento feito depois de perder a reserva é ignorado, sem estorno.
