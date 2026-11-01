## Secretaria: eventos e atividades

Todos os endpoints exigem login (ver [README](../README.md#autenticação)). Admin pode tudo.

| Rota | Quem | Descrição |
|------|------|-----------|
| `POST /events` | logado | Cria rascunho (`draft`); o criador vira `createdBy` e organizer. Campos: `name, description, location, startDate, endDate`. |
| `GET /events?name=` | logado | Admin vê todos; os demais, só os que organizam. |
| `GET /events/:id` | organizer | Evento + `activities`. |
| `PATCH /events/:id` | organizer | Altera só os campos enviados (`null` limpa). |
| `POST /events/:id/publish` | organizer | `draft` → `published`. Exige datas e ao menos 1 atividade. |
| `POST /events/:id/cancel` | organizer | `{reason}` obrigatório. Cancelado não pode mais ser editado. |
| `POST /events/:id/organizers` `{userId}` / `DELETE /events/:id/organizers/:userId` | organizer | O criador não pode ser removido. |
| `DELETE /events/:id` | criador | Só se não estiver publicado (cancele antes); apaga as atividades junto. |
| `POST/GET/PATCH/DELETE /activities[/:id]`, `GET /activities?eventId=`, `GET /events/:id/activities` | organizer do evento | Campos: `eventId, name, description, location, startsAt, endsAt, capacity, rules`. Não apaga atividade de evento publicado. |

Erros: 401 sem token, 403 sem permissão, 404 não encontrado, 400 regra de domínio.

`rules` são só configuradas aqui; quem as aplica é o [registration](../registration/README.md):

```json
[{"type": "payment", "amount": 5, "description": "Taxa"},
 {"type": "payment", "amount": 50, "description": "Ingresso"},
 {"type": "minimumAge", "age": 18}]
```

- `Activity` é um aggregate próprio que referencia `eventId`, não uma lista dentro de `Event`: muda com frequência e é a unidade de inscrição. A permissão vem do evento.
- Estado dos aggregates é privado (`#data`): só muda por `update()`/métodos de domínio, que validam. O mesmo construtor valida na criação e na leitura do banco.
- `CrudController` é só adaptador HTTP → service (não acessa repositório); comandos como publicar/cancelar são rotas extras em `EventController.addRoutes`.

Limitações:
- Schema do SQLite mudou: apague o volume antigo (`docker compose down -v`).
- Organizers são ids de usuário sem validação (não há projeção de usuários aqui).
- Publicação não é transacional com o banco (sem outbox).
- Reduzir `capacity` abaixo das inscrições confirmadas é rejeitado no registration, mas a secretaria não sabe disso.
