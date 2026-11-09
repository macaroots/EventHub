# Endpoints

Cada serviço tem host/porta próprio. Rotas `/public/...` não exigem login.

Fronteiras: [ADR 011](adrs/011-evento-imutavel-apos-publicacao.md) e [ADR 015](adrs/015-cache-do-catalogo-publico.md). O catálogo público fica na Secretaria.

Autenticação: `Authorization: Bearer <JWT>` emitido pelo identity (`{ userId, name }`) → `req.user = { id, name }`.
"Organizador" não é role: é estar em `event.organizers`. Não há admin.

Erros: 400 (validação/regra), 401, 403, 404

## Entidades

Dono: único serviço que grava a entidade. Projeção: cópia só de leitura, atualizada pelas mensagens do dono.

User
    Dono: identity
    {
        id
        name,
        username,
        email,
        passwordHash,
        active: boolean,
        createdAt
    }
    Projeções:
        Credenciamento (Participant) { id, name }    ← UserRegistered, UserUpdated

Event
    Dono: Secretaria
    {
        id
        name
        information
        startDate
        endDate
        status: draft | published | canceled
        cancelReason?
        createdBy
        organizers: List<userId>
    }
    Projeções:
        - Credenciamento { id, status, organizers }    ← EventCreated, EventUpdated, EventPublished, EventCanceled, EventDeleted

Activity (programação)
    Dono: Secretaria
    {
        id
        eventId
        name
        description
        location
        startsAt
        endsAt
    }
    Projeções:
        - Credenciamento { id, eventId }    ← ActivityCreated, ActivityDeleted

Offer (oferta de inscrição da atividade)
    Dono: Credenciamento
    {
        activityId
        capacity?       // sem capacity a atividade não aceita inscrições
        price = 0
        rules = []
        qrCodeDaAtividade
    }
    Projeções: nenhuma.

Registration
    Dono: Credenciamento
    {
        id
        userId
        activityId
        status: pending | confirmed | canceled
        requirements: List<{ id, type, description, amount?, fulfilled }>
        reasons: List<string>
    }
    Projeções: nenhuma.

Attendance (check-in)
    Dono: Credenciamento
    {
        id
        registrationId   // único
        activityId
        userId
        method: code | manual
        checkedInBy
        checkedInAt
    }
    Projeções: nenhuma.

## Identidade
publics: /auth/register,
         /auth/login

 obs: o JWT não tem role. Quem é owner/organizer de um evento é decidido pela Secretaria que olha o vínculo do userId com aquele evento.
 Todo usuário nasce como participant, vira owner ao criar um evento.
 Erros: { error: { code, message, details? } }


### Autenticação

POST /auth/register
Entrada:
    { name,
    username,   (3-30: a-z 0-9 _ . -)
    email,
    password }  (mín. 8)

Saída:
    status 201 { id, name, username, email }

    Emite UserRegistered { userId, name, email }


POST /auth/login
Entrada:
    { username, (username ou e-mail)
    password }

Saída:
    { token,       JWT { userId, name }
    expiresIn }   (segundos)

    O BFF guarda o token no cookie dele; logout é só apagar esse cookie.

### Perfil (Authorization: Bearer <token>)

GET /me
    { id,
    name,
    username,
    email }

PATCH /me
Entrada:
    { name?, email? }
Saída:
    { id, name, username, email }

Emite UserUpdated { userId, name, email }
    o nome no token só muda no próximo login

PUT /me/password
Entrada:
    { currentPassword, newPassword }
Saída:
    204

DELETE /me
    Emite UserDeactivated { userId }
        active = false
    status 204

inscrições antigas continuam apontando para esse userId.

### Interno (header X-Internal-Token)

GET /internal/users/:id
    { id, name, email }   (404 se inativo)

GET /internal/users?email=aa@a.com
    [{ id, name, email }]   (só ativos)

POST /internal/users/batch
Entrada:
    { ids: [uuid] }   (máx. 500)
Saída:
    [{ id, name, email }]   (só ativos)

- usado pelo web (organizadores por e-mail, nomes dos organizadores), e futuramente por emails, certificados e secretaria

## Secretaria

### Público

Sem login. Só eventos `published` e `canceled`; `draft` → 404.
Preço e vagas vêm do Credenciamento (`GET /public/activities/:id/offer`).

GET /public/events?name&from&to&page&limit
    [{
        id
        name
        startDate
        endDate
        status
    }]

GET /public/events/:id
    {
        id
        name
        information
        startDate
        endDate
        status
        cancelReason?
        activities: [{ id, name, startsAt, endsAt, location }]
    }

GET /public/activities/:id
    {
        id
        eventId
        name
        description
        location
        startsAt
        endsAt
        capacity?
        price?
    }

### Gestão

Todos exigem login. Qualquer usuário cria evento (vira createdBy e organizer); demais ações só organizers ou admin.

#### Eventos

GET /events?name
    Admin vê todos; demais, só os eventos de que são organizers.
    [{
        id
        name
        startDate
        endDate
        status
    }]

POST /events
    {
        name
        information
        startDate
        endDate
    }
    201 { id }      // status = draft
    409 se o nome já existe

GET /events/:id
    {
        ...Event
        activities: [{ id, name, startsAt, endsAt }]
    }

PATCH /events/:id
    { name?, information?, startDate?, endDate? }
    204
    400 se canceled

DELETE /events/:id
    Só createdBy ou admin. Só draft ou canceled; apaga as atividades.
    204

POST /events/:id/publish
    draft → published. Exige ao menos uma atividade.
    204

POST /events/:id/cancel
    { reason?='cancelado pelo organizador' }
    204

POST /events/:id/organizers
    { userId } // o web converte e-mail → id em GET /internal/users?email= (ADR 016)
    204

DELETE /events/:id/organizers/:userId
    204

#### Atividades

Permissão herdada do evento. Capacidade, preço e regras ficam no Credenciamento.

GET /events/:id/activities
    [{ id, name, startsAt, endsAt }]

POST /events/:id/activities
    {
        name
        description
        location
        startsAt
        endsAt
    }
    201 { id }
    400 se evento canceled

GET /activities/:id
    Activity

PATCH /activities/:id
    { name?, description?, location?, startsAt?, endsAt? }
    204

DELETE /activities/:id
    204
    400 se evento published

### Emite

EventCreated | EventUpdated | EventPublished { eventId, name, information, startDate, endDate, status, organizers }
EventCanceled { ...idem, reason }
EventDeleted { eventId }
    Adicionar/remover organizer emite EventUpdated.

ActivityCreated | ActivityUpdated { activityId, eventId, name, description, location, startsAt, endsAt }
ActivityDeleted { activityId }

## Credenciamento

Exigem login, exceto `/public`.

### Público

GET /public/activities/:id/offer
    Só atividade de evento `published`.
    {
        activityId
        capacity
        available       // vagas restantes
        price
        rules: List<string>     // descrição legível das regras
    }
    404 se não há oferta

### Participante

POST /activities/:id/queue
    Entra na fila de acesso ao formulário.
    201 { token: JWT { activityId, userId, position }, position }

GET /queue/:token
    { position, called: boolean }
    TODO: websocket avisa quando for chamado.

POST /activities/:id/registrations
    {
        token           // da fila; precisa ter sido chamado
        ...dados do formulário // por enquanto, só userId
    }
    201 Registration
        Sem oferta (capacity) → 400.
        Regra negada também é 201, com status = canceled e reasons.
        Pagamento vira requirement { id = paymentId, type: 'payment', amount }.
    400 se evento não publicado ou token inválido
    409 se já tem inscrição não cancelada na atividade

GET /registrations
    Minhas inscrições (admin: todas).
    List<Registration>

GET /registrations/:id
    Registration

POST /registrations/:id/cancel
    { reason? }
    204

### Organizador

Organizers do evento da atividade, ou admin.

GET /activities/:id/offer
    Offer + { confirmed, pending }

PATCH /activities/:id/offer
    {
        capacity
        price = 0
        rules = []      // ex.: [{ type: 'minimumAge', age: 18 }]
    }
    204
    400 se capacity < inscrições confirmadas
    400 se evento canceled

GET /activities/:id/registrations?status
    [{
        ...Registration
        participant: { id, email }
    }]

POST /registrations/:id/cancel
    { reason }
    204

POST /registrations/:id/requirements/:requirementId/fulfill
    Pendência manual (ex.: verificação de idade).
    204

### Ouve

EventCreated | EventUpdated | EventPublished { eventId, status, organizers }
EventCanceled { eventId, status, reason }
    cancela todas as inscrições
EventDeleted { eventId }

ActivityCreated { activityId, eventId }
    cria a atividade sem oferta
ActivityDeleted { activityId }

UserRegistered | UserUpdated { userId, name, email }

PaymentConfirmed { registrationId, paymentId }
    awaiting_payment → confirmed (RegistrationConfirmed); reserva perdida → ignora

PaymentDenied { registrationId, paymentId, reason }
    cancel → RegistrationCanceled; promove a fila

### Emite

RegistrationCreated { ...Registration }
RegistrationPromoted { registrationId, userId }
RegistrationConfirmed { registrationId, userId }
RegistrationCanceled { registrationId, userId, reason }
PaymentRequested { paymentId, registrationId, userId, amount, description }
ActivityOfferUpdated { activityId, eventId, capacity, price, rules }

## CheckIn como parte do Credenciamento ([ADR 012](adrs/012-forma-do-checkin.md))
### Organizador
GET /activities/:id/checkin
    { activity, event, checkIn: { status: open | closed, code, openedAt }, confirmed, present, attendees: [{ registrationId, participant, status, attendance }] }
POST /activities/:id/checkin/open     // abre ou gera código novo
POST /activities/:id/checkin/close
POST /registrations/:id/checkin       // marcação manual, só confirmed

### Participante
POST /activities/:id/checkin
    { code }        // mostrado na sala
    200 { ...Attendance, alreadyCheckedIn }
    400 código errado, check-in fechado ou inscrição não confirmed

Emite AttendanceRegistered { attendanceId, registrationId, activityId, userId, method, checkedInAt }

GET /activities/:id/waitlist
    [userId]

## Certificado

Certificado {
    participantName
    eventName
    eventDate
    activities: [{name}]
    token verificação
}

POST /events/:eventId/certificates *Consulta se o certificado já foi emitido* // certificado
    status 200 → {certificateId}
    status 404 → {error: "certificate not available"}  // o evento ainda não chegou

    A emissão é assíncrona. O registration publica:
    CertificateRequested {participantId, participantName, eventId, eventName, eventDate, activities: [{name}]}
    e o certificateService.criar consome da fila `certificate`.

    O registration é dono da regra: inscrição confirmada + pelo menos uma presença.
    Não há percentual mínimo. O certificate não chama o registration por HTTP.

GET /certificates *Lista os certificados do participante* pelo JWT token
    [{certificateId, eventName, eventDate}]

GET /certificates/:id *Metadados do certificado* (dono ou admin)
    {id, participantName, eventName, eventDate, activities: [{name}], verificationToken, issuedAt}

GET /certificates/:id/download *Gera e baixa o PDF* (dono ou admin)
    PDF com nome, evento, data, atividades, token, URL e QR Code de validação

GET /certificates/validate/:tokenVerificacao *Validação pública, sem JWT*
    {valid, participantName, eventName, eventDate, activities: [{name}], issuedAt}

    certificadoService.criar
    ouve CertificateRequested


## Portaria dentro do Credenciamento
(Rascunho substituído pelo [ADR 012](adrs/012-forma-do-checkin.md).)
Attendance {
    activityId
    userId
    activityName
    userName
    checkedInAt
}

ouve ActivityCreated
    portariaService.gerarToken()
        gera qrCodeDaAtividade

POST	/activities/:id/attendances // userId do JWT
*Registra presença a partir do QR/token da credencial. Idempotente.* // participante
    { qrCodeDaAtividade }
    emite UserCheckedIn { activityId, userId, checkedInAt }
    201
    400 se inscrição não confirmed

GET	/events/:id/attendances?activityId *Lista/audita check-ins do evento.*
    [{
        Attendance
    }]

## Monitoramente e relatórios

GET /reports/events/:id?format=CSV/XLSX/PDF/JSON
    {
        totalRegistrations
        totalRegistrationsConfirmed
        totalAttendances
    }
GET /reports/activities/:id
    {
        totalRegistrations
        totalRegistrationsConfirmed
        totalAttendances
    }

### Eventos

#### Ouve

EventCreated, ActivityCreated, RegistrationCreated, RegistrationConfirmed, UserCheckedIn