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