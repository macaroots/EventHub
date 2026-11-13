# Arquitetura

Visão geral. Detalhes em [ddd.md](ddd.md), [endpoint.md](endpoint.md), [adrs/](adrs/) e [../microservices/README.md](../microservices/README.md).

## Contextos

| Contexto | Serviço | RF |
|---|---|---|---|
| Identidade | `identity` | RF01 |
| Secretaria | `secretariat` | RF02, RF03, RF04 |
| Credenciamento | `registration` | RF05, RF06, RF09 |
| Caixa | `payment` | RF07 |
| Notificações | — | RF08 |
| Certificados | — | RF10 |
| Relatórios | `reports` | RF11 |
| Monitoramento | — (infra) | — |
| Front | `web` | — |

Não há serviço de catálogo: a programação pública, com preço, vagas e regras, fica na Secretaria ([ADR 002](adrs/002-catalogo-publico.md)). O Credenciamento recebe uma cópia imutável na publicação.

## Capacidades de negócio, dados e projeções

Cada serviço é dono dos seus dados e não lê o banco de outro. No protótipo, cada um usa um SQLite; em produção, um banco relacional (Postgres) por serviço ([ADR 000](adrs/000-escolha-banco.md)). O que vem de fora chega por mensagem e vira projeção local, só com os campos de que ele precisa.

### Identidade (`identity`)
- **Capacidade:** saber quem é o usuário. Cadastro, login e emissão do JWT que os outros serviços validam.
- **Dados próprios:** `users` `{id, username, password, role}`. O papel é `user` ou `admin`, e o admin é criado na subida.
- **Projeções:** nenhuma.
- **Publica:** `UserCreated {userId, username}`.

### Secretaria (`secretariat`)
- **Capacidade:** planejar e publicar eventos. O organizador monta o evento e a programação, define a oferta de cada atividade (vagas, preço, regras de elegibilidade), publica, cancela e escolhe quem organiza. É a dona de toda a informação do evento.
- **Dados próprios:**
  - `events` `{id, name, information, startDate, endDate, status: draft | published | ended | canceled, cancelReason, createdBy, organizers[]}`;
  - `activities` `{id, eventId, name, description, location, startsAt, endsAt, capacity, price, rules[]}`.

  O conteúdo só muda em `draft`.
- **Projeções:** nenhuma. Organizers são ids de usuário, sem validação.
- **Ciclo:** `draft → published → ended | canceled`. `ended` é manual, pelo organizador, para permitir correções de presença antes dos certificados.
- **Publica:** `EventPublished` (com as atividades), `EventCanceled`, `EventOrganizersChanged` e `EventEnded`.

### Credenciamento (`registration`)
- **Capacidade:** garantir a vaga do participante. Inscrição, elegibilidade, capacidade sob concorrência, fila de espera com promoção, reserva com prazo de pagamento e gestão das inscrições pelo organizador e check-in por código da atividade ([ADR 006](adrs/006-forma-do-checkin.md)).
- **Dados próprios:** `registrations` `{id, userId, activityId, status: pending | waitlisted | awaiting_payment | confirmed | canceled, requirements[], reasons[], payment {id, amount, description, requestedAt, paid}, createdAt}`, mais a `version` da atividade, usada no lock otimista ([ADR 003](adrs/003-controle-de-vagas-no-credenciamento.md)); `checkins` `{activityId, status: open | closed, code, openedAt}`; `attendances` `{id, registrationId (único), activityId, userId, method: code | manual, checkedInBy, checkedInAt}`.
- **Projeções:**
  - `activities` `{id, eventId, name, startsAt, endsAt, capacity, price, rules}`: cópia imutável, criada uma vez pelo `EventPublished`;
  - `events` `{id, name, status: published | canceled, organizers[]}`: vem do `EventPublished`, `EventCanceled` e `EventOrganizersChanged`; os organizers autorizam a gestão das inscrições;
  - `participants` `{id, username}`: vem do `UserCreated` (o `UserUpdated` também é ouvido, mas o identity ainda não o publica); só para exibição.
- **Ouve também:** `PaymentConfirmed`, `PaymentDenied` e `EventEnded` (encerra a cópia e pede os certificados).
- **Publica:** `RegistrationCreated`, `RegistrationPromoted`, `RegistrationConfirmed`, `RegistrationCanceled`, `PaymentRequested`, `AttendanceRegistered` e `CertificateRequested`.

### Caixa (`payment`)
- **Capacidade:** cobrar. Cria a cobrança pedida, valida o pagamento no gateway (hoje fake) e informa o resultado.
- **Dados próprios:** `payments` `{id, amount, description, registrationId, status: pending | paid | denied | canceled, receipt}`. O `id` é o `payment.id` da inscrição.
- **Projeções:** nenhuma. Guarda só a referência `registrationId`.
- **Ouve:** `PaymentRequested` (cria a cobrança) e `RegistrationCanceled` (cancela a cobrança pendente).
- **Publica:** `PaymentConfirmed`, `PaymentDenied`.

### Relatórios (`reports`)
- **Capacidade:** monitoramento e relatórios por evento/atividade. É um **read model (CQRS)**: não lê o banco de outro serviço e não faz chamada HTTP para os donos dos dados ([RF11](ddd.md)).
- **Dados próprios (projeções):** `events`, `activities`, `registrations`, `attendances`, `payments`, `participants` e `inbox`, num SQLite próprio (`reports.db`).
- **Ouve:** `Event*`, `Activity*`, `Registration*`, `Payment*`, `UserCheckedIn` e, opcionalmente, `UserCreated`/`UserUpdated`.
- **Publica:** nada.
- **API:** `GET /reports/events/:id`, `GET /reports/activities/:id` e `GET /reports/events/:id/participants`, em JSON/CSV/XLSX/PDF; acesso restrito a organizador do evento ou admin.
- **Trade-off:** a projeção é eventualmente consistente e não é reconstruível sem event store; suba o serviço antes dos publishers e use `dev/seed_report.py` em desenvolvimento.

### Front (`web`, BFF)
- **Capacidade:** telas do participante e do organizador. Compõe as chamadas aos serviços.
- **Dados próprios:** nenhum persistido. Guarda em memória dois caches descartáveis: a ordem da fila de espera por atividade (2 s) e o acesso já autorizado por inscrição ([ADR 004](adrs/004-atualizacao-posicao-na-fila.md)).
- **Projeções:** nenhuma. Lê por HTTP, com o token do usuário.

## Escala

A divisão em serviços segue os contextos, e eles têm perfis de carga diferentes. Cada um pode ganhar mais instâncias sem mexer nos outros, e a fila absorve os picos entre eles.

**No protótipo, porém, todo serviço com dados roda com uma instância só**, porque usa SQLite num volume local. Só o BFF já escala na horizontal. Em produção, cada serviço migra para o Postgres ([ADR 000](adrs/000-escolha-banco.md)) e passa a aceitar várias instâncias.

| Serviço | Carga | Gargalo | Como escala | Gatilho |
|---|---|---|---|---|
| `web` (BFF) | Todo o tráfego HTML, mais o polling da fila de espera | Requisições por segundo; caches por instância | Na horizontal, porque não tem estado. Página pública sem sessão e cacheável ([ADR 002](adrs/002-catalogo-publico.md)) | CPU ou latência alta |
| `secretariat` | Escrita baixa (organizadores). Leitura pública alta na abertura das inscrições | Uma instância no protótipo (SQLite) | Cache HTTP e micro-cache no BFF; CDN com pico real ([ADR 002](adrs/002-catalogo-publico.md)); réplicas depois do Postgres | Pico de leitura que o cache não absorve |
| `registration` | Escrita concorrente na abertura das inscrições; check-in na abertura das atividades | Uma instância no protótipo (SQLite); lock otimista por atividade; a `Activity` carregada com todas as inscrições | Postgres e réplicas do serviço; rate limit; processamento serial por atividade e sala de espera na borda ([ADR 005](adrs/005-fila-de-acesso.md)) | Conflitos de lock ou CPU saturada no pico |
| `identity` | Logins na abertura das inscrições | Uma instância no protótipo; hash de senha (CPU), quando houver | Réplicas, depois do Postgres. Os outros serviços validam o JWT localmente, então o `identity` não está no caminho de cada requisição | Login lento no pico |
| `payment` | Acompanha as inscrições pagas | Latência do gateway externo | Assíncrono: a fila absorve. Consumidores concorrentes depois do Postgres | Fila `payment` crescendo |
| RabbitMQ | Todas as mensagens | Um nó só | Cluster com quorum queues | Indisponibilidade ou fila acumulando |
| `notification` (planejado) | Rajadas (cancelamento de evento, promoções) | Limite do provedor de e-mail | Consumidores concorrentes; a fila absorve | Atraso nos avisos |
| `certificate` (planejado) | Lote no `EventEnded`; validação pública por anos | Geração de PDF (CPU) | Workers em paralelo; validação cacheável | Lote demorado |
| `reports` | Consulta rara, export sob demanda | Volume das projeções e geração de PDF/XLSX | Consumidor único no protótipo (SQLite); réplicas e Postgres depois; export assíncrono se necessário | Consultas lentas ou fila `reports` crescendo |

**Para ter várias instâncias**:
- Postgres compartilhado entre as instâncias do mesmo serviço;
- um relay de outbox ativo por serviço, para manter a ordem;
- tarefas periódicas (expiração) em uma instância só.

O lock otimista, o trigger de capacidade e a inbox já funcionam com várias instâncias.

### Subdivisões possíveis

Um contexto pode virar mais de um deployable quando uma parte tiver carga ou disponibilidade diferente das outras. O modelo e o banco continuam do contexto. Nenhuma das subdivisões abaixo é necessária hoje:

| De | Parte | Quando separar | Referência |
|---|---|---|---|
| `registration` | Check-in | Pico do check-in afetando as inscrições, ou operação offline no local | [ADR 006](adrs/006-forma-do-checkin.md) |
| `registration` | Processamento de inscrições (fila durável e consumidor por atividade) | Disputa pelo lock que o rate limit e as réplicas não resolvem | [ADR 005](adrs/005-fila-de-acesso.md) |
| `secretariat` | Leitura do catálogo (projeção própria do `EventPublished`) | Pico de leitura que cache e CDN não absorvem | [ADR 002](adrs/002-catalogo-publico.md) |
| `web` | BFF público (cacheável) e BFF autenticado | Perfis de carga e de deploy diferentes | [ADR 002](adrs/002-catalogo-publico.md) |
| `identity` | Troca por um IdP (Keycloak, Auth0) | Login social, MFA ou carga de login | — |

## O que já temos

- **Infra:** docker-compose com um serviço por contêiner, hot reload no ambiente de dev e RabbitMQ com exchange `topic` e uma fila durável por serviço.
- **Comunicação:** coreografia por eventos ([ADR 001](adrs/001-comunicacao-assincrona.md)); cada serviço guarda projeções dos dados de outros contextos.
- **Auth:** JWT HS256 emitido pelo identity e validado em `shared/auth`; admin criado na subida.
- **Identity:** cadastro, login e o evento `UserCreated`.
- **Secretaria:** CRUD de eventos e atividades, publicar/cancelar, organizers, permissões; edição só em rascunho e `EventPublished` com o retrato imutável.
- **Credenciamento:** inscrição com regras (`minimumAge`), vaga com fila de espera, reserva com pagamento e expiração, projeções de atividade, evento e participante check-in com comparecimento (RF09, RF11) e pedido de certificados ao encerrar o evento (RF10).
- **Caixa:** recebe `PaymentRequested`, paga por `POST /payments/:id/pay` com gateway fake e publica `PaymentConfirmed` ou `PaymentDenied`.
- **Testes:** secretariat, registration, payment e shared.
- **ADRs:** 000 a 017 (002, 007 e 013 foram mesclados no 012, 015 e 016).

## O que falta

### Por contexto
- **Caixa:** auth, estorno quando a inscrição é cancelada depois de paga e gateway real (adaptador).

### Transversal
- **Persistência:** migrar cada serviço do SQLite para o Postgres antes da produção, com várias instâncias ([ADR 000](adrs/000-escolha-banco.md)).
- **Mensageria:**
  - id de correlação;
  - contratos versionados (AsyncAPI).
- **Monitoramento:** `/health`, logs estruturados, métricas e tracing ([ADR 010](adrs/010-monitoramento.md)).
- **Segurança:** RS256 no lugar do segredo compartilhado.
- **Entrada única:** o `web` é a única entrada, sem API gateway; os serviços deixam de publicar porta e um proxy reverso faz TLS e rate limit ([ADR 007](adrs/007-entrada-unica-sem-api-gateway.md)).
- **Fila de acesso:** só com pico real, e terceirizada na borda; até lá, rate limit em `POST /registrations` ([ADR 005](adrs/005-fila-de-acesso.md)).
