# Web

Telas do organizador (`/organizers/...`):
- `events`: lista e cria. `events/:id`: edita, publica, cancela, apaga, gerencia organizadores e lista atividades. `activities/:id` e `events/:id/activities/new`: formulário da atividade (a regra `minimumAge` vira um campo "Idade mínima").
- `activities/:id/registrations`: gestão das inscrições da atividade (link na lista de atividades do evento e na atividade). Mostra a ocupação, filtra por status (`?status=`), mostra fila de espera e reservas aguardando pagamento, aprova a pendência `age verification` e cancela inscrições (motivo opcional). Quem autoriza é o registration (organizador do evento ou admin).
- Forms HTML só fazem GET/POST: as ações usam `POST .../delete` em vez de `DELETE` (alternativa: `method-override`).
- Post/Redirect/Get: depois de cada ação, redireciona. Em erro, volta para a página com `?error=` (mostrado pelo layout). Limitação: o form perde o que foi digitado.
- Organizadores: o formulário pede o username, e o BFF busca o id em `identity GET /users`, porque a secretaria guarda só ids. A listagem também traduz ids em usernames. Isso é composição no BFF.
  - Limitações: `GET /users` do identity é público e traz todos os usuários.
  - Alternativa: a secretaria manter uma projeção de usuários a partir do evento `UserCreated` (sem chamada síncrona, mas eventualmente consistente).

Fluxo do participante:
- `/` lista os eventos publicados e `/events/:id` mostra o evento e as atividades. As duas são públicas, via `secretariat GET /public/events[/:id]`, que não exige login e não devolve os organizers.
- "Inscrever-se" faz `POST /activities/:id/registrations` e redireciona para `/registrations/:id`, que mostra o status (pendente, na fila de espera, aguardando pagamento, confirmada, cancelada) e as pendências e permite cancelar. `/registrations` lista as inscrições do usuário.
- Em `awaiting_payment`, o link de pagamento leva a `/payments/:id`, onde se informa o comprovante (o gateway fake recusa `deny`). Pagamento recusado cancela a inscrição; reserva expirada cancela a cobrança.
- Pagar é assíncrono: o registration só fica sabendo por `PaymentConfirmed/Denied`. Por isso o BFF consulta a inscrição até 10× a cada 200 ms antes de redirecionar. Alternativas: websocket/SSE, ou uma página de "processando" com refresh.
- Autorização do pagamento: o payment ainda não tem auth. O BFF só mostra se o registration devolve a inscrição do pagamento para o usuário (inscrição de outra pessoa → 403; admin e organizador veem) e só paga se a inscrição for do usuário (ou admin).
- Login: sem sessão, as páginas protegidas redirecionam para `/auth/login?next=<página>` (num POST, a página de origem). O `next` só aceita caminhos locais.
- Limitações:
  - Cancelar uma inscrição já paga não estorna o pagamento.
  - O admin criado na subida do identity pode não chegar ao registration (corrida com o consumer), e aí a inscrição dele falha com `user not found`.
  - Dados criados antes de o registration ter banco não estão nas projeções dele. Para recuperar, salve de novo a atividade e o evento (as mensagens `Updated` refazem a projeção).
