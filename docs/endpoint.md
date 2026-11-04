# Endpoints

Cada serviço tem host/porta próprio.

Autenticação: `Authorization: Bearer <JWT>` emitido pelo identity → `req.user = { id, username, role: 'user' | 'admin' }`.
"Organizador" não é role: é estar em `event.organizers`. Admin pode tudo.

Erros: 400 (validação/regra), 401, 403, 404, 409 (duplicado).

## Entidades

Dono: único serviço que grava a entidade. Projeção: cópia só de leitura, atualizada pelas mensagens do dono.

User
    Dono: identity
    {
        id
        name,
        email,
        passwordHash,
        active: boolean,
        createdAt
    }
    Projeções:
        Credenciamento (Participant) { id, name }    ← UserCreated, UserUpdated

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
        - Catálogo { id, name, information, startDate, endDate, status, cancelReason }    ← EventPublished, EventUpdated, EventCanceled, EventDeleted
        - Credenciamento { id, status, organizers }    ← EventCreated, EventUpdated, EventPublished, EventCanceled, EventDeleted

Activity
    Dono: Secretaria
    {
        id
        eventId
        name
        description
        location
        startsAt
        endsAt
        capacity
        price = 0
        rules = []
        qrCodeDaAtividade
    }
    Projeções:
        - Catálogo { id, eventId, name, description, location, startsAt, endsAt, capacity, price, rules }    ← ActivityCreated, ActivityUpdated, ActivityDeleted
        - Credenciamento { id, eventId, capacity, price, rules }    ← ActivityCreated, ActivityUpdated, ActivityDeleted

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
        registrationId
        activityId
        checkedInAt
    }
    Projeções: nenhuma.

## Identidade
publics: /auth/register,
         /auth/login

 obs: o JWT não tem role. Quem é owner/organizer de um evento é decidido pela Secretaria que olha o vínculo do userId com aquele evento.
 Todo usuário nasce como participant, vira owner ao criar um evento.


### Autenticação

POST /auth/register
Entrada:
    { name, 
    email,
    password }

Saída:
    status 201 { id }

    Emite UserCreated { userId, name, email }


POST /auth/login
Entrada:
    { email, 
    password }

Saída:
    Set-Cookie: token JWT { userId }
    { expiresIn }


POST /auth/logout
    Limpa o cookie

### Perfil

GET /me
    { id, 
    name, 
    email }

PATCH /me
Entrada:
    { name?, email? }
Saída:
    status 204

Emite UserUpdated { userId, name, email }

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

### Interno 

GET /users/:id
    { id, name, email }


GET /users?email=aa@a.com
    { id, name, email }

- usado para emails, certificados e para secretaria confirmar que o usuário existe e está ativo
## Catálogo

Público (sem login). Só eventos `published` e `canceled`; `draft` → 404.

GET /events?name&from&to&page&limit
    [{
        id
        name
        startDate
        endDate
        status
    }]

GET /events/:id
    {
        id
        name
        information
        startDate
        endDate
        status
        cancelReason?
        activities: [{ id, name, startsAt, endsAt, location, price }]
    }

GET /activities/:id
    {
        id
        eventId
        name
        description
        location
        startsAt
        endsAt
        capacity
        price
        rules: List<string>     // descrição legível das regras
    }

### Ouve

EventPublished | EventUpdated | EventCanceled | EventDeleted
ActivityCreated | ActivityUpdated | ActivityDeleted

## Secretaria

Todos exigem login. Qualquer usuário cria evento (vira createdBy e organizer); demais ações só organizers ou admin.

### Eventos

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
    { userId } // verificar como é a conversão de email para id.
    204

DELETE /events/:id/organizers/:userId
    204

### Atividades

Permissão herdada do evento.

GET /events/:id/activities
    [{ id, name, startsAt, endsAt, capacity, price }]

POST /events/:id/activities
    {
        name
        description
        location
        startsAt
        endsAt
        capacity
        price = 0
        rules = []
    }
    201 { id }
    400 se evento canceled

GET /activities/:id
    Activity

PATCH /activities/:id
    { name?, description?, location?, startsAt?, endsAt?, capacity?, price?, rules? }
    204

DELETE /activities/:id
    204
    400 se evento published

TODO: reduzir capacity abaixo das inscrições confirmadas. A Secretaria não sabe a ocupação.

### Emite

EventCreated | EventUpdated | EventPublished { eventId, name, information, startDate, endDate, status, organizers }
EventCanceled { ...idem, reason }
EventDeleted { eventId }
    Adicionar/remover organizer emite EventUpdated.

ActivityCreated | ActivityUpdated { activityId, eventId, name, description, location, startsAt, endsAt, capacity, price, rules }
ActivityDeleted { activityId }

## Credenciamento

Todos exigem login.

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

ActivityCreated | ActivityUpdated { activityId, eventId, capacity, price, rules }
ActivityDeleted { activityId }

UserCreated | UserUpdated { userId, username }

PaymentApproved { registrationId, paymentId }
    fulfill(paymentId); sem pendências → RegistrationConfirmed

PaymentDenied { registrationId, paymentId, reason: 'denied' | 'expired' }
    cancel → RegistrationCanceled

### Emite

RegistrationCreated { ...Registration }
RegistrationConfirmed { registrationId, userId }
RegistrationCanceled { registrationId, userId, reason }
PaymentRequested { paymentId, registrationId, userId, amount, description }


## Certificado

Certificado {
    participantName
    eventName
    eventDate
    activities: [{name}]
    token verificação
}

POST /events/:eventId/certificates *Emite o certificado (idempotente)* // credenciamento
    status 201
    emite CertificateRequested {participantId, participantName, eventId, eventName, eventDate, activities: [{name}]} 
    
certificadoService.criar
    ouve CertificateRequested    
        *Verifica inscrição aprovada + presença > 74%*

GET /certificates *Lista os certificados do participante* pelo JWT token
    [{certificateId, eventName}]

GET /certificates/:id *Metadados do certificado*
    {Certificado}

GET /certificates/:id/download *Gera e baixa o PDF com PDFKit*

GET /certificates/validate/:tokenVerificacao
    {Certificado}


## Portaria dentro do Credenciamento
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