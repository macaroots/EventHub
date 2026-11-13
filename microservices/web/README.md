# Web

Telas do organizador (`/organizers/...`):
- `events/:id`, aba **Relatórios**: carrega indicadores de inscrições, presenças, atividades e pagamentos do microserviço `reports`, além de participantes paginados (25 por página). **Baixar relatório** exporta `relatorio.xlsx` com resumo, atividades, participantes e pagamentos. Os dados são projeções assíncronas; um evento recém-criado pode ainda não ter relatório disponível.
- Conexão com relatórios: `REPORTS_URL` (padrão `http://reports:3006`; fora do Docker, use `http://localhost:3006`). O web encaminha o JWT do usuário; a autorização continua no `reports`. As chamadas têm timeout de 30 segundos e não usam cache. O Compose inclui o serviço e o volume `reports-data`; inicie o consumer antes de criar os eventos, pois não há reconstrução automática do histórico.
- `events`: lista e cria. `events/:id`: edita, publica, encerra (pede os certificados), cancela, apaga, gerencia organizadores e lista atividades. `activities/:id` e `events/:id/activities/new`: formulário da atividade (a regra `minimumAge` vira um campo "Idade mínima").
- `activities/:id/registrations`: gestão das inscrições da atividade (link na lista de atividades do evento e na atividade). Mostra a ocupação, filtra por status (`?status=`), mostra fila de espera e reservas aguardando pagamento, aprova a pendência `age verification` e cancela inscrições (motivo opcional). Quem autoriza é o registration (organizador do evento).
- `activities/:id/checkin`: abre e fecha o check-in, gera um código novo, mostra presentes/confirmados e marca a presença na mão. `?display=1` mostra só o código em letras grandes, para o projetor, e recarrega a cada 10 s. A página de inscrições mostra o comparecimento e quem está presente.
- Forms HTML só fazem GET/POST: as ações usam `POST .../delete` em vez de `DELETE` (alternativa: `method-override`).
- Post/Redirect/Get: depois de cada ação, redireciona. Em erro, volta para a página com `?error=` (mostrado pelo layout). Limitação: o form perde o que foi digitado.
- Organizadores: o formulário pede o e-mail, e o BFF busca o id em `identity GET /internal/users?email=`, porque a secretaria guarda só ids. A listagem traduz ids em nomes com `POST /internal/users/batch`. As duas chamadas usam `X-Internal-Token` (`INTERNAL_API_TOKEN`), não o JWT ([ADR 016](../../docs/adrs/016-organizador-por-email.md)).
  - Usuário desativado some da listagem (aparece o id).

Fluxo do participante:
- `/certificates`: lista todos os certificados do usuário autenticado e permite baixar os PDFs. A sidebar **Certificados** abre essa página. O botão **Gerar certificado** em `/registrations/:id` consulta o certificado do evento para o dono da inscrição e faz seu download. Se a emissão ainda não terminou, a página informa que o certificado não está disponível. A emissão continua assíncrona, pelo `CertificateRequested` publicado após o encerramento do evento; o botão não emite nem altera a elegibilidade.
- Conexão com certificados: `CERTIFICATE_URL` (padrão `http://certificate:3005`; fora do Docker, `http://localhost:3005`). O web encaminha o JWT, aplica timeout de 30 segundos às chamadas do certificate e entrega os downloads como `certificado.pdf`, sem cache. A autorização do PDF é feita pelo microserviço.
- `/` lista os eventos publicados e `/events/:id` mostra o evento e as atividades. As duas são públicas, via `secretariat GET /public/events[/:id]`, que não exige login e não devolve os organizers.
- "Inscrever-se" faz `POST /activities/:id/registrations` e redireciona para `/registrations/:id`, que mostra o status (pendente, na fila de espera, aguardando pagamento, confirmada, cancelada) e as pendências e permite cancelar. `/registrations` lista as inscrições do usuário.
- Na fila de espera (`waitlisted`), a página mostra a posição e se atualiza sozinha; quando a inscrição sai da fila, redireciona para o pagamento ou para a própria inscrição ([ADR 009](../../docs/adrs/009-posicao-na-fila-de-espera.md)):
  - o navegador consulta `GET /registrations/:id/status.json` (`{status, waitlistPosition, next}`) a cada 4 s ([watch-registration.js](src/public/js/watch-registration.js)); sem JavaScript, a página recarrega a cada 15 s;
  - o BFF guarda a ordem da fila por atividade por `WAITLIST_CACHE_MS` (padrão 2000), então o registration recebe uma consulta por atividade nesse intervalo, não uma por pessoa ([waitlist/](src/waitlist/));
  - a autorização é do registration, na primeira consulta de cada inscrição + usuário; depois, enquanto a inscrição está na fila, a resposta sai da memória;
  - limitações: a posição pode atrasar até o cache mais o intervalo (cerca de 6 s); cada instância do BFF tem seu cache;
  - para migrar ao push (SSE), troca-se o `PollingWaitlistSource` e o `watchRegistration`; o payload continua o mesmo.
- Com a inscrição `confirmed`, a página da inscrição pede o código de check-in mostrado na sala; depois, mostra quando a presença foi registrada ([ADR 012](../../docs/adrs/012-forma-do-checkin.md)). Datas no fuso `TIME_ZONE` (padrão `America/Sao_Paulo`).
- Evento encerrado: o certificado é por evento (basta presença em uma atividade). A inscrição diz se a atividade entra no certificado, e some o check-in e o cancelamento. `/registrations` tem a coluna Certificado, por evento. O PDF é baixado pelo botão **Gerar certificado** na inscrição ou pela página **Certificados**.
- Em `awaiting_payment`, o link de pagamento leva a `/payments/:id`, onde se informa o comprovante (o gateway fake recusa `deny`). Pagamento recusado cancela a inscrição; reserva expirada cancela a cobrança.
- Pagar é assíncrono: o registration só fica sabendo por `PaymentConfirmed/Denied`. Por isso o BFF consulta a inscrição até 10× a cada 200 ms antes de redirecionar. Alternativas: websocket/SSE, ou uma página de "processando" com refresh.
- Autorização do pagamento: o payment ainda não tem auth. O BFF só mostra se o registration devolve a inscrição do pagamento para o usuário (inscrição de outra pessoa → 403; organizador vê) e só paga se a inscrição for do usuário.
- Cadastro e login: `/auth/register` e `/auth/login` repassam ao identity (login por username ou e-mail). O identity devolve `{token, expiresIn}`; o BFF grava o token no cookie `token` (httpOnly, mesma validade) e lê o nome do menu do próprio JWT. Logout só apaga o cookie (JWT sem estado, sem revogação).
- Login: sem sessão, as páginas protegidas redirecionam para `/auth/login?next=<página>` (num POST, a página de origem). O `next` só aceita caminhos locais.
- Limitações:
  - Cancelar uma inscrição já paga não estorna o pagamento.
  - Logo após o cadastro, a inscrição pode falhar com `user not found` até o `UserRegistered` chegar ao registration.
  - Sem refresh token: com o JWT expirado, o usuário faz login de novo.
