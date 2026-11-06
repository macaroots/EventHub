import { DuplicateError } from "../../../shared/domain/errors.js";
import { Registration, SEAT_STATUSES } from "./registration.js";

// Entity + AggregateRoot. Cópia imutável da Activity publicada pela secretaria (nome, capacidade, preço, regras)
// + inscrições, que só existem aqui. Toda mudança de inscrição passa por aqui: garante a capacidade e anda a fila.
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
        if (!(capacity >= 0)) throw new TypeError('Capacity must not be lower than 0');
        if (!(price >= 0)) throw new TypeError('Price must not be lower than 0');
        this.#id = id;
        this.#eventId = eventId;
        this.#name = name;
        this.#capacity = capacity;
        this.#price = price;
        this.#registrationRules = rules;
        this.#registrations = registrations;
    }
    get id() { return this.#id; }
    get eventId() { return this.#eventId; }
    // Só para exibição (listagens).
    get name() { return this.#name; }
    get capacity() { return this.#capacity; }
    get price() { return this.#price; }
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
    // Ordem: lotada com confirmados → nega; regras de elegibilidade → vaga → pagamento
    // (só depois das pendências, para não cobrar quem pode ser negado).
    register(userId) {
        if (this.isRegistered(userId)) throw new DuplicateError('user');
        const registration = new Registration({ userId, activityId: this.#id });
        if (this.isFullConfirmed()) registration.cancel('Full occupation');
        for (const rule of this.#registrationRules) {
            if (registration.status == 'canceled') break;
            const outcome = rule.evaluate({ activity: this, userId });
            if (outcome?.deny) { registration.cancel(outcome.deny); break; }
            if (outcome?.require) registration.require(outcome.require);
        }
        registration.submit(!this.isFull(), this.#price);
        this.#registrations.push(registration);
        this.#settle();
        return registration;
    }
    // Pendência de elegibilidade resolvida (ex.: idade conferida).
    fulfill(registrationId, requirementId) {
        const registration = this.#find(registrationId);
        registration.fulfill(requirementId, this.#price);
        this.#settle();
        return registration;
    }
    // Pagamento de outra reserva (expirada, cancelada) é ignorado.
    confirmPayment(registrationId, paymentId) {
        const registration = this.#find(registrationId);
        if (registration.isAwaiting(paymentId)) registration.pay();
        this.#settle();
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
        this.#settle();
        return registration;
    }
    // Reservas aguardando pagamento desde antes de `before` perdem a vaga.
    expireOverdue(before) {
        const overdue = this.#registrations.filter(r => r.status == 'awaiting_payment' && new Date(r.payment.requestedAt) < before);
        for (const r of overdue) r.cancel('Payment expired');
        this.#settle();
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
    isFullConfirmed() {
        return this.getConfirmedOccupation() >= this.#capacity;
    }
    // Regras de elegibilidade vindas da secretaria (ver ruleFromConfig).
    getRules() {
        return this.#registrationRules;
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
    // Fim de toda mudança de inscrição: vaga livre promove a fila; lotada com confirmados, a fila não tem
    // mais o que esperar e é cancelada.
    #settle() {
        for (const r of this.getWaitlist()) {
            if (this.isFull()) break;
            r.promote(this.#price);
        }
        if (this.isFullConfirmed()) for (const r of this.getWaitlist()) r.cancel('Full occupation');
    }
    #find(registrationId) {
        const registration = this.#registrations.find(r => r.id == registrationId);
        if (!registration) throw new Error('Registration not found');
        return registration;
    }
}
