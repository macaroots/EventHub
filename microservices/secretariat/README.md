# Secretaria: eventos e atividades

Todos os endpoints exigem login, exceto o catálogo público.

| Rota | Quem | Descrição |
|------|------|-----------|
| `POST /events` | logado | Cria rascunho (`draft`); o criador vira organizador. |
| `GET /events[/:id]` | organizador | Eventos que organiza; um evento com `activities`. |
| `PATCH /events/:id` | organizador | Só em `draft`. `null` limpa o campo. |
| `POST /events/:id/publish` | organizador | Exige datas e ao menos 1 atividade. Publica `EventPublished`. |
| `POST /events/:id/cancel` `{reason}` | organizador | Publica `EventCanceled`. |
| `POST /events/:id/end` | organizador | `published` → `ended`, a partir do `endDate`. Publica `EventEnded`. |
| `POST /events/:id/organizers` `{userId}`, `DELETE .../organizers/:userId` | organizador | O criador não pode ser removido. |
| `DELETE /events/:id` | criador | Só se não estiver publicado. |
| `/activities[/:id]` (CRUD), `GET /events/:id/activities` | organizador | Só em evento `draft`. `rules`: `[{"type": "minimumAge", "age": 18}]`. |
| `GET /public/events[/:id]` | público | Eventos publicados, sem organizadores ([ADR 002](../../docs/adrs/002-catalogo-publico.md)). |

Ciclo: `draft → published → ended`; `draft` ou `published` → `canceled`.

- Evento e atividades são imutáveis após a publicação: erro exige cancelar e criar outro.
- `ended` é manual, para dar uma janela de correção das presenças antes dos certificados.
- As regras só são configuradas aqui; quem as aplica é o [registration](../registration/README.md).
- Limitação: organizadores são ids de usuário sem validação aqui (o BFF busca o id pelo e-mail no identity).
