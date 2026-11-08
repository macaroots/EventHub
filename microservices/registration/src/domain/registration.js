import { DomainError, NotFoundError } from "../../../shared/domain/errors.js";
// Status que ocupam vaga. A soma deles nunca passa da capacidade.
export const SEAT_STATUSES = ['pending', 'awaiting_payment', 'confirmed'];

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
        if (!r) throw new NotFoundError('Requirement');
        if (this.status == 'canceled') throw new DomainError('Registration is canceled');
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
