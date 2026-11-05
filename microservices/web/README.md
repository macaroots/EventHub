# Web

Telas do organizador (`/organizers/...`):
- `events`: lista e cria. `events/:id`: edita, publica, cancela, apaga, gerencia organizadores e lista atividades. `activities/:id` e `events/:id/activities/new`: formulário da atividade (a regra `minimumAge` vira um campo "Idade mínima").
- Forms HTML só fazem GET/POST: as ações usam `POST .../delete` em vez de `DELETE` (alternativa: `method-override`).
- Post/Redirect/Get: depois de cada ação, redireciona. Em erro, volta para a página com `?error=` (mostrado pelo layout). Limitação: o form perde o que foi digitado.
- Organizadores: o formulário pede o username, e o BFF busca o id em `identity GET /users`, porque a secretaria guarda só ids. A listagem também traduz ids em usernames. Isso é composição no BFF.
  - Limitações: `GET /users` do identity é público e traz todos os usuários.
  - Alternativa: a secretaria manter uma projeção de usuários a partir do evento `UserCreated` (sem chamada síncrona, mas eventualmente consistente).
