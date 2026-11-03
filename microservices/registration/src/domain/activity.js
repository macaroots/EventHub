import { DuplicateError } from "../../../shared/domain/errors.js";

export class ActivityLine {
    activity;
    releasedTokens = [];
    register(token, userId) {
        if (!this.isTokenReleased(token)) {
            throw new Error('Wait your turn');
        }
        return this.activity.register(userId);
    }
    isTokenReleased(token) {
        return this.releasedTokens.some(t => t.id == token.id);
    }
    releaseToken(token) {
        this.releasedTokens.push(token);
    }
}

// Entity + AggregateRoot. Projeção da Activity da secretaria + inscrições (que só existem aqui).
export class Activity {
    #id;
    #eventId;
    #capacity;
    #price;
    #registrations = [];
    #registrationRules = [];

    constructor({ id = crypto.randomUUID(), eventId, capacity, price = 0, rules = [] } = {}) {
        this.#id = id;
        this.#eventId = eventId;
        this.setCapacity(capacity);
        this.setPrice(price);
        this.setRules(rules);
    }
    get id() { return this.#id; }
    get eventId() { return this.#eventId; }

    get capacity() { return this.#capacity; }
    setCapacity(capacity) {
        if (capacity < 0) throw new TypeError('Must not be lower than 0');
        if (capacity < this.getConfirmedOccupation()) throw new TypeError('Must not be lower than confirmed occupation');
        this.#capacity = capacity;
    }
    get price() { return this.#price; }
    setPrice(price) {
        if (price < 0) throw new TypeError('Price must not be lower than 0');
        this.#price = price;
    }
    get registrations() { return this.#registrations; }
    toJSON() {
        return {
            id: this.#id,
            eventId: this.#eventId,
            capacity: this.#capacity,
            price: this.#price,
            registrations: this.#registrations,
            registrationRules: this.#registrationRules
        }
    }

    // Factory: o aggregate cria a Registration e decide o status: vaga, regras de elegibilidade, preço.
    // Regras só avaliam; quem altera a Registration é o aggregate.
    register(userId) {
        if (this.isRegistered(userId)) throw new DuplicateError('user');
        const registration = new Registration(userId, this.#id);
        if (this.isFullConfirmed()) registration.cancel('Full occupation');
        else if (this.isFull()) registration.require({ type: 'wait list' });
        for (const rule of this.#registrationRules) {
            if (registration.status == 'canceled') break;
            const outcome = rule.evaluate({ activity: this, userId });
            if (outcome?.deny) registration.cancel(outcome.deny);
            else if (outcome?.require) registration.require(outcome.require);
        }
        if (this.#price > 0 && registration.status != 'canceled') {
            registration.require({ type: 'payment', amount: this.#price, description: 'Ticket' });
        }
        registration.submit();
        this.#registrations.push(registration);
        return registration;
    }
    cancelAll(reason) {
        for (const r of this.#registrations) if (r.status != 'canceled') r.cancel(reason);
    }
    getOccupation() {
        return this.#registrations.filter(r => r.status != 'canceled').length;
    }
    getConfirmedOccupation() {
        return this.#registrations.filter(r => r.status == 'confirmed').length;
    }
    isFull() {
        return this.getOccupation() >= this.capacity;
    }
    isFullConfirmed() {
        return this.getConfirmedOccupation() >= this.capacity;
    }
    getRules() {
        return this.#registrationRules;
    }
    // Regras de elegibilidade vindas da secretaria (ver ruleFromConfig).
    setRules(rules) {
        this.#registrationRules = rules;
    }
    // Inscrição cancelada não bloqueia nova tentativa.
    isRegistered(userId) {
        return this.#registrations.some(r => r.userId == userId && r.status != 'canceled');
    }
}

// Projeção do User do identity (UserCreated). Só para leitura (listagens, crachá);
// as regras de inscrição não dependem dela.
export class Participant {
    constructor({ id, username }) {
        this.id = id;
        this.username = username;
    }
}

// Entity. Pendências (requirements) têm id para serem resolvidas por mensagens de outros
// contextos (ex.: PaymentConfirmed.paymentId == requirement.id).
export class Registration {
    id;
    userId;
    activityId;
    status = 'pending'; // pending | confirmed | canceled
    requirements = [];
    reasons = [];
    #messages = [];
    #submitted = false;
    constructor(userId, activityId, id=crypto.randomUUID()) {
        this.id = id;
        this.userId = userId;
        this.activityId = activityId;
    }
    require(requirement) {
        this.requirements.push({ id: crypto.randomUUID(), ...requirement, fulfilled: false });
    }
    // Fim da avaliação das regras. Só agora emite mensagens: se uma regra negou,
    // nenhuma cobrança deve ter sido pedida.
    submit() {
        this.#submitted = true;
        this.#messages.push({ type: 'RegistrationCreated', ...this.toJSON() });
        if (this.status == 'canceled') return;
        for (const r of this.requirements.filter(r => r.type == 'payment')) {
            this.#messages.push({ type: 'PaymentRequested', paymentId: r.id, registrationId: this.id, userId: this.userId, amount: r.amount, description: r.description });
        }
        this.#confirmIfReady();
    }
    fulfill(requirementId) {
        const r = this.requirements.find(r => r.id == requirementId);
        if (!r) throw new Error('Requirement not found');
        if (this.status == 'canceled') throw new Error('Registration is canceled');
        r.fulfilled = true;
        this.#confirmIfReady();
    }
    cancel(reason) {
        if (this.status == 'canceled') return;
        this.status = 'canceled';
        this.reasons.push(reason);
        if (this.#submitted) this.#messages.push({ type: 'RegistrationCanceled', registrationId: this.id, userId: this.userId, reason });
    }
    #confirmIfReady() {
        if (this.status != 'pending' || this.getPendingRequirements().length) return;
        this.status = 'confirmed';
        this.#messages.push({ type: 'RegistrationConfirmed', registrationId: this.id, userId: this.userId });
    }
    getPendingRequirements() {
        return this.requirements.filter(r => !r.fulfilled);
    }
    getReasons() {
        return this.reasons;
    }
    pullMessages() {
        const m = this.#messages;
        this.#messages = [];
        return m;
    }
    toJSON() {
        const { id, activityId, status, requirements, reasons } = this;
        return { id, userId: this.userId, activityId, status, requirements, reasons };
    }
}

// TODO fila de espera (invariante da Activity, não serviço à parte):
// - status 'waitlisted' na Registration (não conta na ocupação) no lugar da pendência 'wait list'
// - todo cancelamento passa pela Activity (activity.cancel(registrationId, reason)), que promove o 1º da fila
// - cobrar só na promoção: hoje quem cai na fila recebe PaymentRequested
// - prazo de pagamento (expiresAt) é do registration: job chama activity.expireOverdue(now)
// - lock otimista (version) na Activity ao persistir
// - Activity como fonte da verdade das inscrições (registrationRepository vira leitura ou sai)
// - ActivityLine (tokens) é sala de espera de tráfego, não fila de espera; pode ir para o gateway

// Regras de elegibilidade: avaliam e retornam { deny: motivo } | { require: pendência } | undefined.
// Não alteram a Registration nem publicam mensagens (sem efeito colateral).
// Capacidade e preço não são regras: são atributos da Activity.
// Sem data de nascimento na projeção de Participant: vira pendência de verificação.
export class MinimumAgeRule {
    constructor(age) {
        this.age = age;
    }
    evaluate() {
        return { require: { type: 'age verification', minimumAge: this.age } };
    }
}

// Config da secretaria ({type, ...}) -> regra.
export function ruleFromConfig(config) {
    switch (config.type) {
        case 'minimumAge': return new MinimumAgeRule(config.age);
        default: throw new TypeError(`Unknown rule ${config.type}`);
    }
}
