# Arquitetura: estado atual

Visão geral do que existe e do que falta. Detalhes em [ddd.md](ddd.md), [endpoint.md](endpoint.md), [adrs/](adrs/) e [../microservices/README.md](../microservices/README.md).

## Contextos

| Contexto | Serviço | RF | Estado |
|---|---|---|---|
| Identidade | `identity` | RF01 | Parcial |
| Secretaria | `secretariat` | RF02, RF03, RF04 | Pronto (SQLite) |
| Credenciamento | `registration` | RF05, RF06, RF09 | Parcial |
| Caixa | `payment` | RF07 | Parcial |
| Notificações | — | RF08 | ADR 004 |
| Certificados | — | RF10 | ADR 003 |
| Relatórios | — | RF11 | ADR 005 |
| Monitoramento | — (infra) | — | ADR 006 |
| Front | `web` | — | Protótipo do fluxo, sem integração |

Não há serviço de catálogo: a programação pública, com preço, vagas e regras, fica na Secretaria (`/public`). O Credenciamento recebe uma cópia imutável na publicação ([ADR 011](adrs/evento-imutavel-apos-publicacao.md)).

## Capacidades de negócio, dados e projeções

Cada serviço é dono dos seus dados (um SQLite por serviço) e não lê o banco de outro. O que vem de fora chega por mensagem e vira projeção local, só com os campos de que ele precisa.

### Identidade (`identity`)
- **Capacidade:** saber quem é o usuário. Cadastro, login e emissão do JWT que os outros serviços validam.
- **Dados próprios:** `users` `{id, username, password, role}`. O papel é `user` ou `admin`, e o admin é criado na subida.
- **Projeções:** nenhuma.
- **Publica:** `UserCreated {userId, username}`.

### Secretaria (`secretariat`)
- **Capacidade:** planejar e publicar eventos. O organizador monta o evento e a programação, define a oferta de cada atividade (vagas, preço, regras de elegibilidade), publica, cancela e escolhe quem organiza. É a dona de toda a informação do evento ([ADR 011](adrs/evento-imutavel-apos-publicacao.md)).
- **Dados próprios:**
  - `events` `{id, name, information, startDate, endDate, status: draft | published | ended | canceled, cancelReason, createdBy, organizers[]}`;
  - `activities` `{id, eventId, name, description, location, startsAt, endsAt, capacity, price, rules[]}`.

  O conteúdo só muda em `draft`.
- **Projeções:** nenhuma. Organizers são ids de usuário, sem validação.
- **Ciclo:** `draft → published → ended | canceled`. `ended` é manual, pelo organizador, para permitir correções de presença antes dos certificados.
- **Publica:** `EventPublished` (com as atividades), `EventCanceled`, `EventOrganizersChanged` e `EventEnded`.

### Credenciamento (`registration`)
- **Capacidade:** garantir a vaga do participante. Inscrição, elegibilidade, capacidade sob concorrência, fila de espera com promoção, reserva com prazo de pagamento e gestão das inscrições pelo organizador e check-in por código da atividade ([ADR 002](adrs/checkin-no-registration.md), [ADR 012](adrs/forma-do-checkin.md)).
- **Dados próprios:** `registrations` `{id, userId, activityId, status: pending | waitlisted | awaiting_payment | confirmed | canceled, requirements[], reasons[], payment {id, amount, description, requestedAt, paid}, createdAt}`, mais a `version` da atividade, usada no lock otimista ([ADR 008](adrs/vaga-e-pagamento-como-status.md)); `checkins` `{activityId, status: open | closed, code, openedAt}`; `attendances` `{id, registrationId (único), activityId, userId, method: code | manual, checkedInBy, checkedInAt}`.
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

### Front (`web`, BFF)
- **Capacidade:** telas do participante e do organizador. Compõe as chamadas aos serviços.
- **Dados próprios:** nenhum persistido. Guarda em memória dois caches descartáveis: a ordem da fila de espera por atividade (2 s) e o acesso já autorizado por inscrição ([ADR 009](adrs/posicao-na-fila-de-espera.md)).
- **Projeções:** nenhuma. Lê por HTTP, com o token do usuário.

## O que já temos

- **Infra:** docker-compose com um serviço por contêiner, hot reload no ambiente de dev e RabbitMQ com exchange `topic` e uma fila durável por serviço.
- **Comunicação:** coreografia por eventos ([ADR 001](adrs/comunicacao-assincrona.md)); cada serviço guarda projeções dos dados de outros contextos.
- **Auth:** JWT HS256 emitido pelo identity e validado em `shared/auth`; admin criado na subida.
- **Identity:** cadastro, login e o evento `UserCreated`.
- **Secretaria:** CRUD de eventos e atividades, publicar/cancelar, organizers, permissões; edição só em rascunho e `EventPublished` com o retrato imutável ([ADR 011](adrs/evento-imutavel-apos-publicacao.md)).
- **Credenciamento:** inscrição com regras (`minimumAge`), vaga com fila de espera, reserva com pagamento e expiração, projeções de atividade, evento e participante check-in com comparecimento (RF09, RF11) e pedido de certificados ao encerrar o evento (RF10).
- **Caixa:** recebe `PaymentRequested`, paga por `POST /payments/:id/pay` com gateway fake e publica `PaymentConfirmed` ou `PaymentDenied`.
- **Testes:** secretariat, registration, payment e shared.
- **ADRs:** 001 a 007.

## O que falta

### Por contexto
- **Identity:** persistência (hoje em memória), hash de senha, `name` e `email` (pré-requisito de certificados e notificações) e `UserUpdated`.
- **Credenciamento:**
  - check-in: janela de horário (projetar `startsAt`/`endsAt`) e desfazer presença ([ADR 012](adrs/forma-do-checkin.md));
  - certificados: definir o critério de elegibilidade (hoje provisório: um por evento, basta um check-in) e a reemissão.
- **Caixa:** auth, estorno quando a inscrição é cancelada depois de paga e gateway real (adaptador).
- **Notificações, Certificados e Relatórios:** criar, conforme os ADRs.
- **Web:** integrar com as APIs, ou com um API gateway/BFF. A tela de atividade compõe programação (Secretaria) e oferta (Credenciamento).

### Transversal
- **Mensageria:**
  - outbox, porque a publicação não é transacional com o banco;
  - DLQ, porque hoje um handler que falha confirma a mensagem e ela se perde;
  - `id` e `time` em toda mensagem, para idempotência e relatórios (envelope `{id, type, source, time, data}`);
  - id de correlação;
  - contratos versionados (AsyncAPI).
- **Monitoramento:** `/health`, logs estruturados, métricas e tracing ([ADR 006](adrs/monitoramento.md)).
- **Segurança:** RS256 no lugar do segredo compartilhado.
- **Entrada única:** API gateway na frente dos serviços (hoje cada um expõe sua porta).
- **Fila de acesso:** só com pico real, e terceirizada na borda; até lá, rate limit em `POST /registrations` ([ADR 010](adrs/fila-de-acesso.md)).
- **Docs:** status dos ADRs (todos "Proposto" ou em branco), numeração duplicada (001) e exchange chamado `loja`.

## Context map

`U` = upstream, `D` = downstream, `OHS` = Open Host Service, `PL` = Published Language, `CF` = Conformist, `ACL` = Anti-Corruption Layer, `SK` = Shared Kernel. Tracejado = planejado.

```mermaid
flowchart LR
    classDef planned stroke-dasharray: 5 5,fill:#f6f6f6,color:#666
    classDef external fill:#eee,color:#333

    Identity["Identidade<br/>(identity)"]
    Secretaria["Secretaria<br/>(secretariat)"]
    Credenciamento["Credenciamento<br/>(registration)<br/><i>core</i>"]
    Caixa["Caixa<br/>(payment)"]
    Notificacoes["Notificações"]:::planned
    Certificados["Certificados"]:::planned
    Relatorios["Relatórios"]:::planned
    Gateway["Gateway de pagamento"]:::external

    Identity -- "U: OHS/PL (UserCreated)<br/>D: CF (Participant)" --> Credenciamento
    Identity -. "SK: JWT (shared/auth)" .- Secretaria
    Secretaria -- "U: OHS/PL (EventPublished com atividades, EventCanceled, EventOrganizersChanged, EventEnded)<br/>D: CF (cópia imutável, ADR 011)" --> Credenciamento
    Credenciamento -- "Customer/Supplier<br/>PaymentRequested ⇄ PaymentConfirmed/Denied" --> Caixa
    Caixa -- "ACL (PaymentGateway)" --> Gateway
    Certificados -. "U: OHS/PL (CertificateRequested)<br/>D: Credenciamento CF" .-> Credenciamento
    Credenciamento -. "U: PL / D: CF (Registration*)" .-> Notificacoes
    Secretaria -. "U: PL / D: CF (EventCanceled)" .-> Notificacoes
    Identity -. "U: PL / D: CF (contato)" .-> Notificacoes
    Credenciamento & Secretaria & Identity & Caixa -. "U: PL / D: CF (todos os eventos)" .-> Relatorios
```

- **Credenciamento** é o core domain. Identidade, Notificações, Certificados e Relatórios são genéricos, e Caixa é de suporte.
- **Secretaria** é dona da programação; o **Credenciamento**, da oferta (capacidade, preço, regras). A projeção entre eles leva só ids, status e organizers ([ADR 007](adrs/fronteiras-secretaria-credenciamento.md)).
- **Certificados** é upstream: define a própria mensagem de entrada, e o credenciamento se conforma a ela ([ADR 003](adrs/certificados.md)).
- **Shared Kernel:** `microservices/shared` (bus, auth, repositórios). É acoplamento consciente, porque uma mudança ali afeta todos os serviços.

## C4: nível 1, contexto

```mermaid
C4Context
    title Event Hub: contexto do sistema

    Person(participante, "Participante", "Consulta a programação, inscreve-se, paga, faz check-in e obtém certificados")
    Person(organizador, "Organizador", "Cria eventos e atividades e acompanha inscrições e presença")
    Person(admin, "Admin", "Administra a plataforma")

    System(eventhub, "Event Hub", "Gestão de eventos acadêmicos e profissionais, multi-organização")

    System_Ext(pagamento, "Gateway de pagamento", "Processa cobranças (hoje fake)")
    System_Ext(email, "Provedor de e-mail", "Envia notificações (planejado)")

    Rel(participante, eventhub, "Usa", "HTTPS")
    Rel(organizador, eventhub, "Usa", "HTTPS")
    Rel(admin, eventhub, "Usa", "HTTPS")
    Rel(eventhub, pagamento, "Cobra", "HTTPS")
    Rel(eventhub, email, "Envia avisos", "SMTP/API")
```

## C4: nível 2, containers

```mermaid
C4Container
    title Event Hub: containers

    Person(participante, "Participante")
    Person(organizador, "Organizador")

    System_Boundary(eh, "Event Hub") {
        Container(web, "web", "Node, Express, EJS", "Front (protótipo)")
        Container(identity, "identity", "Node, Express", "Usuários e JWT")
        Container(secretariat, "secretariat", "Node, Express", "Eventos, programação e catálogo público")
        ContainerDb(secretariatDb, "secretariat.db", "SQLite", "Eventos e atividades")
        Container(registration, "registration", "Node, Express", "Oferta, inscrições, regras, fila e check-in")
        Container(payment, "payment", "Node, Express", "Cobranças")
        ContainerQueue(rabbit, "RabbitMQ", "exchange topic", "Eventos de domínio, uma fila por serviço")

        Container(notification, "notification", "planejado", "Avisos por e-mail")
        Container(certificate, "certificate", "planejado", "PDF e validação")
        Container(report, "report", "planejado", "Log de eventos e consultas")
    }

    System_Ext(gateway, "Gateway de pagamento")
    System_Ext(email, "Provedor de e-mail")

    Rel(participante, web, "Usa", "HTTPS")
    Rel(participante, secretariat, "Consulta programação", "HTTPS /public")
    Rel(organizador, secretariat, "Gerencia eventos e programação", "HTTPS/JWT")
    Rel(organizador, registration, "Configura oferta, acompanha inscrições", "HTTPS/JWT")
    Rel(participante, registration, "Vê oferta, inscreve-se", "HTTPS")
    Rel(participante, payment, "Paga", "HTTPS")
    Rel(participante, identity, "Login", "HTTPS")

    Rel(secretariat, secretariatDb, "Lê/grava")
    Rel(identity, rabbit, "UserCreated")
    Rel(secretariat, rabbit, "EventPublished, EventCanceled, EventOrganizersChanged")
    Rel(registration, rabbit, "Registration*, PaymentRequested / ouve Event*, User*, Payment*")
    Rel(payment, rabbit, "PaymentConfirmed/Denied / ouve PaymentRequested")
    Rel(rabbit, notification, "Registration*, EventCanceled...")
    Rel(rabbit, certificate, "CertificateRequested")
    Rel(rabbit, report, "# (todos)")

    Rel(payment, gateway, "verify()", "ACL")
    Rel(notification, email, "Envia")

    UpdateLayoutConfig($c4ShapeInRow="4", $c4BoundaryInRow="1")
```

O C4 de nível 3 (componentes) vale a pena só para o `registration`, onde está o domínio core: `Activity` (aggregate com a oferta e factory das inscrições), `Registration`, regras, `Attendance`, app service e as projeções.
