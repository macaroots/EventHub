import { DuplicateError } from "../../../shared/domain/errors.js";

export class ActivityLine {
    activity;
    releasedTokens = [];
    register(token, user) {
        if (!this.isTokenReleased(token)) {
            throw new Error('Wait your turn');
        }
        return this.activity.register(user);
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
    #registrations = [];
    #registrationRules = [];

    constructor({ capacity, rules = [], id = crypto.randomUUID(), eventId } = {}) {
        this.#id = id;
        this.#eventId = eventId;
        this.setCapacity(capacity);
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
    get registrations() { return this.#registrations; }
    toJSON() {
        return {
            id: this.#id,
            eventId: this.#eventId,
            capacity: this.#capacity,
            registrations: this.#registrations,
            registrationRules: this.#registrationRules
        }
    }

    // TODO qual deve ser a entrada? 
    // só userId, cria a registration dentro de register()
    // uma registration criado fora, 
    // uma resposta para um "formulário de inscrição" definido pela atividade com as regras e informações necessárias
    // Factory: o aggregate cria a Registration e decide o status a partir das regras.
    // Regras só avaliam; quem altera a Registration é o aggregate.
    register(user) {
        if (this.isRegistered(user)) throw new DuplicateError('user');
        const registration = new Registration(user, this.#id);
        for (const rule of this.#registrationRules) {
            const outcome = rule.evaluate({ activity: this, user });
            if (outcome?.deny) {
                registration.cancel(outcome.deny);
                break;
            }
            if (outcome?.require) registration.require(outcome.require);
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
    // CapacityRule sempre primeiro; as demais vêm da secretaria (ver ruleFromConfig).
    setRules(rules) {
        this.#registrationRules = [new CapacityRule(), ...rules];
    }
    // Inscrição cancelada não bloqueia nova tentativa.
    isRegistered(user) {
        return this.#registrations.some(r => r.user.id == user.id && r.status != 'canceled');
    }
}
export class User {
    id;
    constructor(id=crypto.randomUUID()) {
        this.id = id;
    }
}

// Entity. Pendências (requirements) têm id para serem resolvidas por mensagens de outros
// contextos (ex.: PaymentConfirmed.paymentId == requirement.id).
export class Registration {
    id;
    user;
    activityId;
    status = 'pending'; // pending | confirmed | canceled
    requirements = [];
    reasons = [];
    #messages = [];
    #submitted = false;
    constructor(user, activityId, id=crypto.randomUUID()) {
        this.id = id;
        this.user = user;
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
            this.#messages.push({ type: 'PaymentRequested', paymentId: r.id, registrationId: this.id, userId: this.user.id, amount: r.amount, description: r.description });
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
        if (this.#submitted) this.#messages.push({ type: 'RegistrationCanceled', registrationId: this.id, userId: this.user.id, reason });
    }
    #confirmIfReady() {
        if (this.status != 'pending' || this.getPendingRequirements().length) return;
        this.status = 'confirmed';
        this.#messages.push({ type: 'RegistrationConfirmed', registrationId: this.id, userId: this.user.id });
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
        return { id, userId: this.user.id, activityId, status, requirements, reasons };
    }
}

// TODO avaliar se capacidade deve ser uma regra de inscrição ou um método específico da atividade
// Regras: avaliam e retornam { deny: motivo } | { require: pendência } | undefined.
// Não alteram a Registration nem publicam mensagens (sem efeito colateral).
export class CapacityRule {
    evaluate({ activity }) {
        if (activity.isFullConfirmed()) return { deny: 'Full occupation' };
        if (activity.isFull()) return { require: { type: 'wait list' } };
    }
}

export class PaymentRule {
    constructor(amount, description = 'Payment') {
        this.amount = amount;
        this.description = description;
    }
    evaluate() {
        return { require: { type: 'payment', amount: this.amount, description: this.description } };
    }
}

// Sem data de nascimento na projeção de User: vira pendência de verificação.
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
        case 'payment': return new PaymentRule(config.amount, config.description);
        case 'minimumAge': return new MinimumAgeRule(config.age);
        default: throw new TypeError(`Unknown rule ${config.type}`);
    }
}
