import { DuplicateError } from "../../../shared/domain/errors.js";

// Status que ocupam vaga. A soma deles nunca passa da capacidade.
export const SEAT_STATUSES = ['pending', 'awaiting_payment', 'confirmed'];

// Entity + AggregateRoot. Projeção da Activity da secretaria + inscrições (que só existem aqui).
// Toda mudança de inscrição passa por aqui: é quem garante a capacidade e promove a fila de espera.
export class Activity {
    #id;
    #eventId;
    #name;
    #capacity;
    #price;
    #registrations = [];
    #registrationRules = [];

    // registrations: só ao reconstituir do banco.
    constructor({ id = crypto.randomUUID(), eventId, name, capacity, price = 0, rules = [], registrations = [] } = {}) {
        this.#id = id;
        this.#eventId = eventId;
        this.#name = name;
        this.#registrations = registrations;
        this.#validateCapacity(capacity);
        this.#capacity = capacity;
        this.setPrice(price);
        this.setRules(rules);
    }
    get id() { return this.#id; }
    get eventId() { return this.#eventId; }
    // Só para exibição (listagens).
    get name() { return this.#name; }
    setName(name) { this.#name = name; }

    get capacity() { return this.#capacity; }
    // Reduzir abaixo da ocupação não despeja ninguém: só impede novas vagas até liberar.
    setCapacity(capacity) {
        this.#validateCapacity(capacity);
        this.#capacity = capacity;
        this.#promote();
    }
    #validateCapacity(capacity) {
        if (!(capacity >= 0)) throw new TypeError('Must not be lower than 0');
        if (capacity < this.getConfirmedOccupation()) throw new TypeError('Must not be lower than confirmed occupation');
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
            name: this.#name,
            capacity: this.#capacity,
            price: this.#price,
            registrations: this.#registrations,
            registrationRules: this.#registrationRules
        }
    }

    // Factory: o aggregate cria a Registration e decide o status.
    // Ordem: regras de elegibilidade → vaga → pagamento (só depois das pendências, para não cobrar quem pode ser negado).
    register(userId) {
        if (this.isRegistered(userId)) throw new DuplicateError('user');
        const registration = new Registration({ userId, activityId: this.#id });
        for (const rule of this.#registrationRules) {
            const outcome = rule.evaluate({ activity: this, userId });
            if (outcome?.deny) { registration.cancel(outcome.deny); break; }
            if (outcome?.require) registration.require(outcome.require);
        }
        registration.submit(!this.isFull(), this.#price);
        this.#registrations.push(registration);
        return registration;
    }
    // Pendência de elegibilidade resolvida (ex.: idade conferida).
    fulfill(registrationId, requirementId) {
        const registration = this.#find(registrationId);
        registration.fulfill(requirementId, this.#price);
        return registration;
    }
    // Pagamento de outra reserva (expirada, cancelada) é ignorado.
    confirmPayment(registrationId, paymentId) {
        const registration = this.#find(registrationId);
        if (registration.isAwaiting(paymentId)) registration.pay();
        return registration;
    }
    denyPayment(registrationId, paymentId, reason) {
        const registration = this.#find(registrationId);
        if (registration.isAwaiting(paymentId)) this.cancel(registrationId, `Payment denied: ${reason}`);
        return registration;
    }
    cancel(registrationId, reason) {
        const registration = this.#find(registrationId);
        registration.cancel(reason);
        this.#promote();
        return registration;
    }
    // Reservas aguardando pagamento desde antes de `before` perdem a vaga.
    expireOverdue(before) {
        const overdue = this.#registrations.filter(r => r.status == 'awaiting_payment' && new Date(r.payment.requestedAt) < before);
        for (const r of overdue) r.cancel('Payment expired');
        this.#promote();
        return overdue;
    }
    // Evento cancelado: ninguém é promovido.
    cancelAll(reason) {
        for (const r of this.#registrations) r.cancel(reason);
    }
    getOccupation() {
        return this.#registrations.filter(r => SEAT_STATUSES.includes(r.status)).length;
    }
    getConfirmedOccupation() {
        return this.#registrations.filter(r => r.status == 'confirmed').length;
    }
    isFull() {
        return this.getOccupation() >= this.#capacity;
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
    // Fila de espera por ordem de chegada. Empate no milissegundo: ordem de inserção (sort estável;
    // o repositório carrega por createdAt, rowid).
    getWaitlist() {
        return this.#registrations.filter(r => r.status == 'waitlisted')
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    // 1, 2, ...; null fora da fila.
    getWaitlistPosition(registrationId) {
        const i = this.getWaitlist().findIndex(r => r.id == registrationId);
        return i < 0 ? null : i + 1;
    }
    #promote() {
        for (const r of this.getWaitlist()) {
            if (this.isFull()) break;
            r.promote(this.#price);
        }
    }
    #find(registrationId) {
        const registration = this.#registrations.find(r => r.id == registrationId);
        if (!registration) throw new Error('Registration not found');
        return registration;
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

// Entity. Só a Activity muda o status (ela sabe se há vaga).
// status: pending (pendências de elegibilidade) | waitlisted | awaiting_payment | confirmed | canceled
// requirements: só elegibilidade (ex.: age verification). Vaga e pagamento são status, não pendências.
// payment: { id, amount, description, requestedAt, paid }. payment.id é o paymentId do serviço de pagamento.
export class Registration {
    id;
    userId;
    activityId;
    status = 'pending';
    requirements = [];
    reasons = [];
    payment = null;
    createdAt;
    #messages = [];
    #submitted = false;
    constructor({ id = crypto.randomUUID(), userId, activityId, status = 'pending', requirements = [], reasons = [], payment = null, createdAt = new Date().toISOString() }) {
        Object.assign(this, { id, userId, activityId, status, requirements, reasons, payment, createdAt });
    }
    // Reconstitui do banco: não dispara os eventos de criação novamente.
    static restore(data) {
        const r = new Registration(data);
        r.#submitted = true;
        return r;
    }
    require(requirement) {
        this.requirements.push({ id: crypto.randomUUID(), ...requirement, fulfilled: false });
    }
    // Fim da avaliação das regras. Só agora emite mensagens: se uma regra negou, nada é cobrado.
    submit(hasSeat, price) {
        this.#submitted = true;
        if (this.status != 'canceled') {
            if (hasSeat) this.#advance(price);
            else this.status = 'waitlisted';
        }
        this.#messages.unshift({ type: 'RegistrationCreated', ...this.toJSON() });
    }
    fulfill(requirementId, price) {
        const r = this.requirements.find(r => r.id == requirementId);
        if (!r) throw new Error('Requirement not found');
        if (this.status == 'canceled') throw new Error('Registration is canceled');
        r.fulfilled = true;
        if (this.status == 'pending') this.#advance(price);
    }
    promote(price) {
        this.status = 'pending';
        this.#messages.push({ type: 'RegistrationPromoted', registrationId: this.id, userId: this.userId });
        this.#advance(price);
    }
    isAwaiting(paymentId) {
        return this.status == 'awaiting_payment' && this.payment.id == paymentId;
    }
    pay() {
        this.payment.paid = true;
        this.#confirm();
    }
    cancel(reason) {
        if (this.status == 'canceled') return;
        this.status = 'canceled';
        this.reasons.push(reason);
        if (this.#submitted) this.#messages.push({ type: 'RegistrationCanceled', registrationId: this.id, userId: this.userId, reason });
    }
    // Com vaga: pendências → pagamento → confirmada.
    #advance(price) {
        if (this.getPendingRequirements().length) return;
        if (price > 0) {
            this.status = 'awaiting_payment';
            this.payment = { id: crypto.randomUUID(), amount: price, description: 'Ticket', requestedAt: new Date().toISOString(), paid: false };
            const { id: paymentId, amount, description } = this.payment;
            this.#messages.push({ type: 'PaymentRequested', paymentId, registrationId: this.id, userId: this.userId, amount, description });
            return;
        }
        this.#confirm();
    }
    #confirm() {
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
        const { id, userId, activityId, status, requirements, reasons, payment, createdAt } = this;
        return { id, userId, activityId, status, requirements, reasons, payment, createdAt };
    }
}

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
    toJSON() {
        return { type: 'minimumAge', age: this.age };
    }
}

// Config da secretaria ({type, ...}) -> regra. O inverso é rule.toJSON() (persistência).
export function ruleFromConfig(config) {
    switch (config.type) {
        case 'minimumAge': return new MinimumAgeRule(config.age);
        default: throw new TypeError(`Unknown rule ${config.type}`);
    }
}
