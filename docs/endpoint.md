# Endpoints

## Catálogo

GET /events?query - listar
    [{
        id,
        name,
        startDate,
        endDate,
    }]

GET /events/:id
    {
        id,
        name,
        startDate,
        endDate,
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
    startDate,
    endDate,
    information,
}
Activity {
    id,
    eventId,
    name,
    horario?,
    locations,
    registrationRules: string | List<Regra>
    capacity
}

## Secretaria
Todos os endpoints precisam estar logado, ou seja
 enviar cookie JWT Organizador | Admin {
            userId,
            role: 'user' | 'admin'
        }

GET /events
    [
        {
            id
            name
            startDate,
            endDate
        }
    ]

POST /events
    {
        id
        name
        startDate
        endDate
        information
    }
    status = 201

GET /events/:id
    {
        id
        name
        startDate,
        endDate,
        information
    }

PATCH /events/:id
    {
        name
        startDate
        endDate
        information
    }
    status = 204

DELETE /events/:id
    status = 204

POST /events/:id/publish
    status = 204

POST /events/:id/cancel
    status = 204

POST /events/:id/organizers
    status = 204

DELETE /events/:id/organizers/:userId
    status = 204

GET /activities
    [
        {
            id,
            eventId
            name
        }
    ]
    
POST /activities
    status = 201

GET /activities/:id
    {
        id,
        eventId,
        name,
        time,
        location,
        registrationRules
        capacity
    }

PATCH /activities/:id
    {
        name,
        time,
        location,
        registrationRules
        capacity
    }
    status = 204

DELETE /activities/:id
    status = 204

GET /events/:id/activities
    [
        {
            id,
            name
        }
    ]

### Entidades

Event {
    id,
    name,
    startDate,
    endDate,
    information,
}
Activity {
    id,
    eventId,
    name,
    horario?,
    locations,
    registrationRules: string | List<Regra>
    capacity
}

### Eventos

#### Emite

['EventCreated', 'EventUpdated', 'EventPublished', 'EventCanceled'] { eventId, status }

ActivityCreated { activityId, eventId, capacity, price = 0, rules = [] }

ActivityUpdated { activityId, eventId, capacity, price = 0, rules = [] }

ActivityDeleted { activityId }

## Credenciamento
Todos os endpoints precisam estar logado, ou seja
 enviar cookie JWT Participante {
            userId,
        }

### Participante

GET /activities/:id/register
    {
        tokenFila: JWT {
            order
        }
    }

POST /activities/:id/register/
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

GET /registrations/:id
    {
        registrationId,
        status: 'approved' | 'pending' | 'denied'
        reasons?
    }

### Organizadores

GET /activities/:id/registrations
    [
        {
            registrationId,
            status: 'approved' | 'pending' | 'denied'
            reasons?
        }
    ]


### Eventos

#### Ouve

['EventCreated', 'EventUpdated', 'EventPublished', 'EventCanceled'] { eventId, status }

ActivityCreated { activityId, eventId, capacity, price = 0, rules = [] }

ActivityUpdated { activityId, eventId, capacity, price = 0, rules = [] }

ActivityDeleted { activityId }

PaymentConfirmed { registrationId, paymentId }
    approveRegistration()
        Emite RegistrationApproved

PaymentDenied {registrationId, reason='denied' | 'expired'}
    denyRegistration()
        Emite RegistrationDenied {reason}

#### Emite

RegistrationCreated {...registration}
RegistrationCanceled {registrationId, userId, reason}
RegistrationConfirmed {registrationId, userId }
PaymentRequested {paymentId, registrationId, userId, amount, description}

### Entidades

Activity {
    id
    eventId
    capacity
    registrations
    registrationRules
}

Registration {
    id
    userId
    activityId
    status: pending | confirmed | canceled
    requirements
    reasons
    #messages 
    #submitted
}

## Front

GET /activity/:id/register
    {
        tokenFila
    }

    Form HTML