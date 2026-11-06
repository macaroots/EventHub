# Web

Telas do organizador (`/organizers/...`):
- `events`: lista e cria. `events/:id`: edita, publica, encerra (pede os certificados), cancela, apaga, gerencia organizadores e lista atividades. `activities/:id` e `events/:id/activities/new`: formulário da atividade (a regra `minimumAge` vira um campo "Idade mínima").
- `activities/:id/registrations`: gestão das inscrições da atividade (link na lista de atividades do evento e na atividade). Mostra a ocupação, filtra por status (`?status=`), mostra fila de espera e reservas aguardando pagamento, aprova a pendência `age verification` e cancela inscrições (motivo opcional). Quem autoriza é o registration (organizador do evento ou admin).
- `activities/:id/checkin`: abre e fecha o check-in, gera um código novo, mostra presentes/confirmados e marca a presença na mão. `?display=1` mostra só o código em letras grandes, para o projetor, e recarrega a cada 10 s. A página de inscrições mostra o comparecimento e quem está presente.
- Forms HTML só fazem GET/POST: as ações usam `POST .../delete` em vez de `DELETE` (alternativa: `method-override`).
- Post/Redirect/Get: depois de cada ação, redireciona. Em erro, volta para a página com `?error=` (mostrado pelo layout). Limitação: o form perde o que foi digitado.
- Organizadores: o formulário pede o username, e o BFF busca o id em `identity GET /users?username=`, porque a secretaria guarda só ids. A listagem traduz ids em usernames com `GET /users`. As duas chamadas repassam o JWT. Isso é composição no BFF ([ADR 013](../../docs/adrs/organizador-por-username.md)).
  - Limitação: a listagem ainda traz todos os usuários.

Fluxo do participante:
- `/` lista os eventos publicados e `/events/:id` mostra o evento e as atividades. As duas são públicas, via `secretariat GET /public/events[/:id]`, que não exige login e não devolve os organizers.
- "Inscrever-se" faz `POST /activities/:id/registrations` e redireciona para `/registrations/:id`, que mostra o status (pendente, na fila de espera, aguardando pagamento, confirmada, cancelada) e as pendências e permite cancelar. `/registrations` lista as inscrições do usuário.
- Na fila de espera (`waitlisted`), a página mostra a posição e se atualiza sozinha; quando a inscrição sai da fila, redireciona para o pagamento ou para a própria inscrição ([ADR 009](../../docs/adrs/posicao-na-fila-de-espera.md)):
  - o navegador consulta `GET /registrations/:id/status.json` (`{status, waitlistPosition, next}`) a cada 4 s ([watch-registration.js](src/public/js/watch-registration.js)); sem JavaScript, a página recarrega a cada 15 s;
  - o BFF guarda a ordem da fila por atividade por `WAITLIST_CACHE_MS` (padrão 2000), então o registration recebe uma consulta por atividade nesse intervalo, não uma por pessoa ([waitlist/](src/waitlist/));
  - a autorização é do registration, na primeira consulta de cada inscrição + usuário; depois, enquanto a inscrição está na fila, a resposta sai da memória;
  - limitações: a posição pode atrasar até o cache mais o intervalo (cerca de 6 s); cada instância do BFF tem seu cache;
  - para migrar ao push (SSE), troca-se o `PollingWaitlistSource` e o `watchRegistration`; o payload continua o mesmo.
- Com a inscrição `confirmed`, a página da inscrição pede o código de check-in mostrado na sala; depois, mostra quando a presença foi registrada ([ADR 012](../../docs/adrs/forma-do-checkin.md)). Datas no fuso `TIME_ZONE` (padrão `America/Sao_Paulo`).
- Evento encerrado: o certificado é por evento (basta presença em uma atividade). A inscrição diz se a atividade entra no certificado, e some o check-in e o cancelamento. `/registrations` tem a coluna Certificado, por evento. O PDF virá do serviço de certificados (outro time); ainda não há link.
- Em `awaiting_payment`, o link de pagamento leva a `/payments/:id`, onde se informa o comprovante (o gateway fake recusa `deny`). Pagamento recusado cancela a inscrição; reserva expirada cancela a cobrança.
- Pagar é assíncrono: o registration só fica sabendo por `PaymentConfirmed/Denied`. Por isso o BFF consulta a inscrição até 10× a cada 200 ms antes de redirecionar. Alternativas: websocket/SSE, ou uma página de "processando" com refresh.
- Autorização do pagamento: o payment ainda não tem auth. O BFF só mostra se o registration devolve a inscrição do pagamento para o usuário (inscrição de outra pessoa → 403; admin e organizador veem) e só paga se a inscrição for do usuário (ou admin).
- Login: sem sessão, as páginas protegidas redirecionam para `/auth/login?next=<página>` (num POST, a página de origem). O `next` só aceita caminhos locais.
- Limitações:
  - Cancelar uma inscrição já paga não estorna o pagamento.
  - O admin criado na subida do identity pode não chegar ao registration (corrida com o consumer), e aí a inscrição dele falha com `user not found`.
