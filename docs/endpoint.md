# Endpoints

## Catálogo

GET /events?query - listar
    [{
        id,
        name,
        periodo?
    }]

GET /events/:id
    {
        id,
        name,
        periodo?,
        information,
        schedule: List<Atividade>
    }

GET /activity/:id
    {
        id,
        eventId,
        name,
        horario?,
        locations,
        registrationRules: string | List<Regra>
        vagas? vacancy?
    }

### Entidades

Event {
    id,
    name,
    periodo?,
    information,
    schedule: List<Atividade>
}
Activity {
    id,
    eventId,
    name,
    horario?,
    locations,
    registrationRules: string | List<Regra>
    vagas? vacancy?
}


## Credenciamento
Todos os endpoints precisam estar logado, ou seja
 enviar cookie JWT Participante {
            userId,
        }

GET /activity/:id/register
    {
        tokenFila: JWT {
            order
        }
    }

POST /activity/:id/register/
Entrada:
    {
        tokenFila,
        ... outras informacoes da inscricao?
    }
Saída:
    {
        registrationId,
        status: 'approved' | 'pending' | 'denied'
        reasons?
    }
    Emite 
        RegistrationCreated {
            status
            reasons?
        }
        PaymentCreated {
            id,
            description
            amount
        }

GET /registration/:id
    {
        registrationId,
        status: 'approved' | 'pending' | 'denied'
        reasons?
    }

### Eventos

Ouve PaymentApproved {paymentId}
    approveRegistration()
        Emite RegistrationApproved

Ouve PaymentDenied {paymentId}
    denyRegistration()
        Emite RegistrationDenied {reason: 'payment denied'}

Ouve PaymentExpired {paymentId}
    cancelRegistration()
        Emite RegistrationCanceled {reason: 'payment expired'}

### Entidades

Activity {
    id,
    vagas? vacancy?
}

Registration {
    id,
    userId,
    activity,
    status: 'approved' | 'pending' | 'denied',
    reasons,
    payment
}

Payment {
    id,
    description
    amount
}

## Front

GET /activity/:id/register
    {
        tokenFila
    }

    Form HTML

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
    { id, 
    name,
    email }

    Emite UserRegistered { userId, name, email }


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
    { id, name, email }

Emite UserUpdated { userId, name, email }

PUT /me/password
Entrada:
    { currentPassword, newPassword }
Saída:
    204

DELETE /me
    Emite UserDeactivated { userId }
        active = false

inscrições antigas continuam apontando para esse userId.

### Interno 

GET /internal/users/id
    { id, name, email }


GET /internal/users?email=aa@a.com
    { id, name, email }

- usado para emails, certificados e para secretaria confirmar que o usuário existe e está ativo

### Entidades

User {
    id: 
    name,
    email,
    passwordHash,
    active: boolean,
    createdAt
}


## Secretaria (partes ligadas à Identidade)

obs: qualquer usuário logado cria um evento e vira owner dele. O owner e os organizers podem adicionar outros organizers àquele evento. nas operaçoes a secretaria confere o vínculo do userId com o evento.


GET /me/events
    [{ id, name, status, role: owner | organizer }]

só os eventos em que o usuário é responsável 


POST /events/:id/publish
Saída:
    { id, status: 'published' }
    Emite EventPublished { eventId }

Só o owner

POST /events/:id/cancel
Entrada:
    { reason? }
Saída:
    { id, status: 'canceled' }
    Emite EventCanceled { eventId, reason }

 Só o owner. sispara credenciamento cancela
inscrições, notificações avisa os participantes.

### Front
    padrao: 
    dialog("reason:cancelado pela organização")


POST /events/id/organizers
Entrada:
    { email }
Saída:
    { eventId, 
    userId, 
    role: 'organizer' }

    Emite OrganizerAdded { eventId, userId }

chama GET /internal/users?email no Identidade para achar userId, quem é adicionado vira organizer só neste evento. 

DELETE /events/id/organizers/userId

    Emite OrganizerRemoved { 
        eventId, userId }

O owner remove qualquer organizer. Um organizer só pode remover a si mesmo.


### Eventos

Ouve UserDeactivated {userId}

uma conta desativada não deve continuar administrando eventos permitir só leitura.
