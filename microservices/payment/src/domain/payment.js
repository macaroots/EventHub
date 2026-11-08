export class Payment {
    id;
    amount;
    description;
    registrationId;
    status = 'pending'; // pending | paid | denied | canceled
    receipt;
    #messages = []
    constructor(amount, id, { registrationId, description } = {}) {
        if (!(amount > 0)) throw new TypeError('amount must be > 0');
        this.amount = amount;
        this.id = id;
        this.registrationId = registrationId;
        this.description = description;
    }

    // Reconstitui do banco (sem mensagens pendentes).
    static restore({ id, amount, description, registrationId, status, receipt }) {
        return Object.assign(new Payment(amount, id, { registrationId, description }), { status, receipt });
    }

    pay(receipt) {
        this.#assertPending();
        this.status = 'paid';
        this.receipt = receipt;
        this.#messages.push({type: 'PaymentConfirmed', paymentId: this.id, registrationId: this.registrationId, receipt});
    }
    deny(reason) {
        this.#assertPending();
        this.status = 'denied';
        this.#messages.push({type: 'PaymentDenied', paymentId: this.id, registrationId: this.registrationId, reason});
    }
    // A inscrição perdeu a reserva (expirou, cancelada): não aceita mais pagamento.
    cancel() {
        if (this.status == 'pending') this.status = 'canceled';
    }
    #assertPending() {
        if (this.status != 'pending') throw new Error(`Payment already ${this.status}`);
    }
    pullMessages() {
        const m = this.#messages;
        this.#messages = [];
        return m;
    }
}
