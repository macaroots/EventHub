## Secretaria: eventos e atividades

Todos os endpoints exigem login (ver [README](../README.md#autenticação)). Admin pode tudo.

| Rota | Quem | Descrição |
|------|------|-----------|
| `POST /events` | logado | Cria rascunho (`draft`); o criador vira `createdBy` e organizer. Campos: `name, description, location, startDate, endDate`. |
| `GET /events?name=` | logado | Admin vê todos; os demais, só os que organizam. |
| `GET /events/:id` | organizer | Evento + `activities`. |
| `PATCH /events/:id` | organizer | Só em `draft`. Altera só os campos enviados (`null` limpa). |
| `POST /events/:id/publish` | organizer | `draft` → `published`. Exige datas e ao menos 1 atividade. Publica `EventPublished` com as atividades. |
| `POST /events/:id/cancel` | organizer | `{reason}` obrigatório. |
| `POST /events/:id/end` | organizer | **Planejado.** `published` → `ended`, depois do `endDate`. Publica `EventEnded`. |
| `POST /events/:id/organizers` `{userId}` / `DELETE /events/:id/organizers/:userId` | organizer | Até o cancelamento (também depois de publicado). O criador não pode ser removido. |
| `DELETE /events/:id` | criador | Só se não estiver publicado (cancele antes); apaga as atividades junto. |
| `POST/GET/PATCH/DELETE /activities[/:id]`, `GET /activities?eventId=`, `GET /events/:id/activities` | organizer do evento | Campos: `eventId, name, description, location, startsAt, endsAt, capacity, price, rules` (`price` padrão 0). Criar, alterar e apagar só em evento `draft`. `GET` traz `eventStatus`. |

Ciclo do evento:

```
draft → published → ended      (planejado: organizador encerra)
            ↘ canceled
```

- `ended` é manual para dar uma janela de correção de presenças antes dos certificados.
- `EventEnded` dispara a elegibilidade no registration, que pede os certificados ([ADR 003](../../docs/adrs/certificados.md)).

Erros: 401 sem token, 403 sem permissão, 404 não encontrado, 400 regra de domínio.

`rules` são regras de elegibilidade, só configuradas aqui; quem as aplica é o [registration](../registration/README.md). Capacidade e preço não são regras:

```json
[{"type": "minimumAge", "age": 18}]
```

- Imutável após a publicação ([ADR 011](../../docs/adrs/evento-imutavel-apos-publicacao.md)): evento e atividades só mudam em `draft`; publicado só é cancelado. A secretaria é dona de toda a informação (inclusive capacidade, preço e regras); o registration recebe uma cópia no `EventPublished`. Rascunho não gera mensagens.
- `Activity` é um aggregate próprio que referencia `eventId`, não uma lista dentro de `Event`: é a unidade de inscrição. A permissão vem do evento.
- Estado dos aggregates é privado (`#data`): só muda por `update()`/métodos de domínio, que validam. O mesmo construtor valida na criação e na leitura do banco.
- `CrudController` é só adaptador HTTP → service (não acessa repositório). Gera o CRUD num `basePath` (estilo `resources` do Rails); rotas extras com path absoluto ficam em `addRoutes` (ex.: publicar/cancelar em `EventController`, `GET /events/:eventId/activities` em `ActivityController`). Routers são montados na raiz. Sem dependência extra; alternativas prontas (NestJS + `@nestjsx/crud`, Feathers) trariam um framework inteiro.

Limitações:
- Schema do SQLite mudou: apague o volume antigo (`docker compose down -v`).
- Organizers são ids de usuário sem validação (não há projeção de usuários aqui).
- Publicação não é transacional com o banco (sem outbox).
- Erro num evento publicado exige cancelar e criar outro.
