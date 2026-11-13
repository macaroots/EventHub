# Arquitetura

Visão geral. Detalhes em [adrs/](adrs/), [contratos](../microservices/contracts/README.md) e [../microservices/README.md](../microservices/README.md). Diagrama RF → contexto → mensagens: [diagrams/arquitetura.md](diagrams/arquitetura.md).

## Contextos

| Contexto | Serviço | RF |
|---|---|---|
| Identidade | `identity` | RF01 |
| Secretaria | `secretariat` | RF02, RF03, RF04 |
| Credenciamento | `registration` | RF05, RF06, RF09 |
| Caixa | `payment` | RF07 |
| Notificações | `notification` (API + worker) | RF08 |
| Certificados | `certificate` | RF10 |
| Relatórios | `reports` | RF11 |
| Monitoramento | — (infra) | — |
| Front | `web` | — |

Não há serviço de catálogo: a programação pública, com preço, vagas e regras, fica na Secretaria ([ADR 002](adrs/002-catalogo-publico.md)). O Credenciamento recebe uma cópia imutável na publicação.

## Capacidades de negócio, dados e projeções

Cada serviço é dono dos seus dados e não lê o banco de outro (*Database per service*). O que vem de fora chega por mensagem e vira projeção local, só com os campos de que ele precisa. Exceção: o `reports` lê cópias somente leitura dos bancos de outros serviços na subida (ver abaixo).

### Identidade (`identity`)
- **Capacidade:** saber quem é o usuário. Cadastro, login e emissão do JWT que os outros serviços validam.
- **Dados próprios:** `users` `{id, name, username, email, password_hash, active, created_at}`, em Postgres.
- **Projeções:** nenhuma.
- **Publica:** `UserRegistered {userId, name, email}`. `UserUpdated` e `UserDeactivated` têm contrato e consumidores, mas não são publicados hoje.

### Secretaria (`secretariat`)
- **Capacidade:** planejar e publicar eventos. O organizador monta o evento e a programação, define a oferta de cada atividade (vagas, preço, regras de elegibilidade), publica, encerra, cancela e escolhe quem organiza. É a dona de toda a informação do evento e serve o catálogo público (`/public/events`).
- **Dados próprios:**
  - `events` `{id, name, information, location, startDate, endDate, status: draft | published | ended | canceled, cancelReason, createdBy, organizers[]}`;
  - `activities` `{id, eventId, name, description, location, startsAt, endsAt, capacity, price, rules[]}`.

  O conteúdo só muda em `draft`.
- **Projeções:** nenhuma. Organizers são ids de usuário; o BFF troca o e-mail pelo id no identity.
- **Ciclo:** `draft → published → ended`; `draft` ou `published` → `canceled`. `ended` é manual, pelo organizador, para permitir correções de presença antes dos certificados.
- **Publica:** `EventPublished` (com as atividades), `EventCanceled`, `EventOrganizersChanged` e `EventEnded`.

### Credenciamento (`registration`)
- **Capacidade:** garantir a vaga do participante ([ADR 003](adrs/003-controle-de-vagas-no-credenciamento.md)). Inscrição, elegibilidade, capacidade sob concorrência, fila de espera com promoção, reserva com prazo de pagamento, gestão das inscrições pelo organizador e check-in por código da atividade ([ADR 006](adrs/006-forma-do-checkin.md)).
- **Dados próprios:**
  - `registrations` `{id, userId, activityId, status: pending | waitlisted | awaiting_payment | confirmed | canceled, requirements[], reasons[], payment {id, amount, description, requestedAt, expiresAt}, createdAt}`, mais a `version` da atividade, usada no lock otimista;
  - `checkins` `{activityId, status: open | closed, code, openedAt}`;
  - `attendances` `{id, registrationId (único), activityId, userId, method: code | manual, checkedInBy, checkedInAt}`.
- **Projeções:**
  - `activities` `{id, eventId, name, startsAt, endsAt, capacity, price, rules}`: cópia imutável, criada uma vez pelo `EventPublished`;
  - `events` `{id, name, status: published | ended | canceled, organizers[]}`: vem do `EventPublished`, `EventCanceled`, `EventEnded` e `EventOrganizersChanged`; os organizers autorizam a gestão das inscrições;
  - `participants` `{id, name}`: vem do `UserRegistered` (também ouve `UserUpdated`); só para exibição.
- **Ouve também:** `PaymentConfirmed`, `PaymentDenied` e `PaymentExpired`.
- **Publica:** `RegistrationCreated`, `RegistrationPromoted`, `RegistrationConfirmed`, `RegistrationCanceled`, `PaymentRequested`, `AttendanceRegistered`, `CheckInOpened`, `CheckInClosed`, `CertificateRequested` e `CertificateDenied` (sem presença no evento).

### Caixa (`payment`)
- **Capacidade:** cobrar. Cria a cobrança pedida, simula o pagamento (aprovado ou recusado) e informa o resultado. A cobrança vence no prazo da reserva.
- **Dados próprios:** `payments` `{id, amount, description, registrationId, userId, status: pending | paid | denied | expired | canceled, receipt, expiresAt}`. O `id` é o `payment.id` da inscrição.
- **Projeções:** nenhuma. Guarda só a referência `registrationId`.
- **Ouve:** `PaymentRequested` (cria a cobrança) e `RegistrationCanceled` (cancela a cobrança pendente).
- **Publica:** `PaymentConfirmed`, `PaymentDenied` e `PaymentExpired`.

### Notificações (`notification`)
- **Capacidade:** avisar o participante por e-mail (SMTP; Mailpit no ambiente local) e listar os avisos dele (`GET /notifications`).
- **Dados próprios:** notificações enviadas e tentativas, em SQLite. A API e o worker que consome a fila compartilham o volume.
- **Projeções:** contatos `{userId, name, email}`, de `UserRegistered`/`UserUpdated`/`UserDeactivated` e de `PUT /contacts/me` (o BFF sincroniza no login).
- **Ouve:** `PaymentRequested`, `PaymentConfirmed`, `PaymentDenied`, `PaymentExpired`, `RegistrationCreated`, `RegistrationConfirmed`, `RegistrationCanceled`, `CheckInOpened`, `CheckInClosed`, `CertificateIssued` e `CertificateDenied`.
- **Publica:** nada.

### Certificados (`certificate`)
- **Capacidade:** emitir, listar, baixar (PDF com QR Code) e validar publicamente certificados.
- **Dados próprios:** `certificates`, em SQLite. A emissão é idempotente por participante e evento.
- **Projeções:** nenhuma: o `CertificateRequested` traz tudo o que o certificado precisa.
- **Ouve:** `CertificateRequested`.
- **Publica:** `CertificateIssued` (outbox), só na primeira emissão.

### Relatórios (`reports`)
- **Capacidade:** monitoramento e relatórios por evento/atividade. É um **read model (CQRS)** e não faz chamada HTTP para os donos dos dados ([RF11](ddd.md)).
- **Dados próprios (projeções):** `events`, `activities`, `registrations`, `attendances`, `payments`, `participants` e `inbox`, num SQLite próprio (`reports.db`).
- **Ouve:** `Event*`, `Registration*`, `Payment*`, `AttendanceRegistered` e `User*`.
- **Publica:** nada.
- **API:** `GET /reports/events/:id`, `GET /reports/activities/:id` e `GET /reports/events/:id/participants`, em JSON/CSV/XLSX/PDF; acesso restrito a organizador do evento ou admin.
- **Bootstrap:** na subida, o compose monta os volumes de `secretariat`, `registration` e `payment` somente leitura (`REPORTS_BOOTSTRAP_*_DB`) e o `reports` preenche as projeções a partir deles. Isso quebra o *Database per Service*: acopla o `reports` ao schema dos outros serviços. Alternativa: um replay de eventos pelos produtores ou um event store.
- **Trade-off:** a projeção é eventualmente consistente; sem o bootstrap, não é reconstruível porque o RabbitMQ não guarda histórico.

### Front (`web`, BFF)
- **Capacidade:** telas do participante e do organizador. Compõe as chamadas aos serviços.
- **Dados próprios:** nenhum persistido. Guarda em memória dois caches descartáveis: a ordem da fila de espera por atividade (2 s) e o acesso já autorizado por inscrição ([ADR 004](adrs/004-atualizacao-posicao-na-fila.md)).
- **Projeções:** nenhuma. Lê por HTTP, com o token do usuário.

## Escala

A divisão em serviços segue os contextos, e eles têm perfis de carga diferentes. Cada um pode ganhar mais instâncias sem mexer nos outros, e a fila absorve os picos entre eles.

**No protótipo, porém, todo serviço com SQLite roda com uma instância só**, porque o banco fica num volume local. Só o BFF já escala na horizontal. Em produção, cada serviço migra para o Postgres ([ADR 000](adrs/000-escolha-banco.md)) e passa a aceitar várias instâncias.

| Serviço | Carga | Gargalo | Como escala | Gatilho |
|---|---|---|---|---|
| `web` (BFF) | Todo o tráfego HTML, mais o polling da fila de espera | Requisições por segundo; caches por instância | Na horizontal, porque não tem estado. Página pública sem sessão e cacheável ([ADR 002](adrs/002-catalogo-publico.md)) | CPU ou latência alta |
| `secretariat` | Escrita baixa (organizadores). Leitura pública alta na abertura das inscrições | Uma instância no protótipo (SQLite) | Cache HTTP e micro-cache no BFF; CDN com pico real ([ADR 002](adrs/002-catalogo-publico.md)); réplicas depois do Postgres | Pico de leitura que o cache não absorve |
| `registration` | Escrita concorrente na abertura das inscrições; check-in na abertura das atividades | Uma instância no protótipo (SQLite); lock otimista por atividade; a `Activity` carregada com todas as inscrições | Postgres e réplicas do serviço; rate limit; processamento serial por atividade e sala de espera na borda ([ADR 005](adrs/005-fila-de-acesso.md)) | Conflitos de lock ou CPU saturada no pico |
| `identity` | Logins na abertura das inscrições | Hash de senha (bcrypt, CPU) | Réplicas (já usa Postgres). Os outros serviços validam o JWT localmente, então o `identity` não está no caminho de cada requisição | Login lento no pico |
| `payment` | Acompanha as inscrições pagas | Latência do gateway externo (hoje simulado) | Assíncrono: a fila absorve. Consumidores concorrentes depois do Postgres | Fila `payment` crescendo |
| RabbitMQ | Todas as mensagens | Um nó só | Cluster com quorum queues | Indisponibilidade ou fila acumulando |
| `notification` | Rajadas (cancelamento de evento, promoções) | Limite do provedor de e-mail | Mais workers; a fila absorve | Atraso nos avisos |
| `certificate` | Lote no `EventEnded`; validação pública por anos | Geração de PDF (CPU) | Workers em paralelo; validação cacheável | Lote demorado |
| `reports` | Consulta rara, export sob demanda | Volume das projeções e geração de PDF/XLSX | Consumidor único no protótipo (SQLite); réplicas e Postgres depois; export assíncrono se necessário | Consultas lentas ou fila `reports` crescendo |

**Para ter várias instâncias**:
- Postgres compartilhado entre as instâncias do mesmo serviço;
- um relay de outbox ativo por serviço, para manter a ordem;
- tarefas periódicas (expiração) em uma instância só.

O lock otimista, o trigger de capacidade e a inbox já funcionam com várias instâncias.

### Subdivisões possíveis

Um contexto pode virar mais de um deployable quando uma parte tiver carga ou disponibilidade diferente das outras. O modelo e o banco continuam do contexto. A API e o worker do `notification` já são um exemplo. Nenhuma das subdivisões abaixo é necessária hoje:

| De | Parte | Quando separar | Referência |
|---|---|---|---|
| `registration` | Check-in | Pico do check-in afetando as inscrições, ou operação offline no local | [ADR 006](adrs/006-forma-do-checkin.md) |
| `registration` | Processamento de inscrições (fila durável e consumidor por atividade) | Disputa pelo lock que o rate limit e as réplicas não resolvem | [ADR 005](adrs/005-fila-de-acesso.md) |
| `secretariat` | Leitura do catálogo (projeção própria do `EventPublished`) | Pico de leitura que cache e CDN não absorvem | [ADR 002](adrs/002-catalogo-publico.md) |
| `web` | BFF público (cacheável) e BFF autenticado | Perfis de carga e de deploy diferentes | [ADR 002](adrs/002-catalogo-publico.md) |
| `identity` | Troca por um IdP (Keycloak, Auth0) | Login social, MFA ou carga de login | — |

## O que já temos

- **Infra:** docker-compose com um serviço por contêiner, hot reload no ambiente de dev e RabbitMQ com exchange `topic` e uma fila durável por serviço. Só o `web` e o `certificate` (validação pública) publicam porta ([ADR 007](adrs/007-entrada-unica-sem-api-gateway.md)).
- **Comunicação:** coreografia por eventos ([ADR 001](adrs/001-comunicacao-assincrona.md)), com outbox, inbox, retry e DLQ nos serviços Node; cada serviço guarda projeções dos dados de outros contextos.
- **Auth:** JWT HS256 emitido pelo identity e validado localmente por todos os serviços.
- **Identity:** cadastro, login e o evento `UserRegistered`.
- **Secretaria:** CRUD de eventos e atividades, publicar/encerrar/cancelar, organizers, permissões e catálogo público; edição só em rascunho e `EventPublished` com o retrato imutável.
- **Credenciamento:** inscrição com regras (`minimumAge`), vaga com fila de espera, reserva com pagamento e expiração, check-in com comparecimento (RF09, RF11) e pedido de certificados ao encerrar o evento (RF10).
- **Caixa:** recebe `PaymentRequested`, simula o pagamento (`POST /payments/:id/pay`), expira cobranças vencidas e publica o resultado.
- **Notificações, Certificados e Relatórios:** consomem as mensagens dos outros contextos, sem chamada HTTP entre serviços.
- **Testes:** unidade e integração em todos os serviços, contratos das mensagens contra os schemas e e2e (fluxo principal e falha de dependência).
- **ADRs:** 000 a 010.

## O que falta

### Por contexto
- **Identity:** publicar `UserUpdated` e `UserDeactivated` (já têm consumidores).
- **Caixa:** estorno quando a inscrição é cancelada depois de paga e gateway real (adaptador).
- **Relatórios:** trocar o bootstrap pelos bancos dos outros serviços por replay de eventos.

### Transversal
- **Persistência:** migrar cada serviço do SQLite para o Postgres antes da produção, com várias instâncias ([ADR 000](adrs/000-escolha-banco.md)).
- **Mensageria:**
  - id de correlação;
  - contratos versionados (AsyncAPI); schema para `CertificateIssued`, `CertificateDenied`, `CheckInOpened`, `CheckInClosed` e `PaymentExpired`;
  - garantias dos serviços Python iguais às do bus Node (outbox, retry e DLQ em todos).
- **Monitoramento:** `/health` em todos os serviços (hoje só nos Python), logs estruturados, métricas e tracing ([ADR 010](adrs/010-monitoramento.md)).
- **Segurança:** RS256 no lugar do segredo compartilhado.
- **Entrada única:** proxy reverso na frente do `web` para TLS e rate limit ([ADR 007](adrs/007-entrada-unica-sem-api-gateway.md)).
- **Fila de acesso:** só com pico real, e terceirizada na borda; até lá, rate limit em `POST /registrations` ([ADR 005](adrs/005-fila-de-acesso.md)).
