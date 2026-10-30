
export class Payment {
    id;
    amount;
    status;
    receipt;
    #messages = []
    constructor(amount, id) {
        this.amount = amount;
        this.id = id;
    }

    pay(receipt) {
        this.status = 'paid';
        this.receipt = receipt;
        this.#messages.push({type: 'PaymentConfirmed', paymentId: this.id, receipt});
    }
    deny(reason) {
        this.status = 'denied';
        this.#messages.push({type: 'PaymentDenied', paymentId: this.id, reason});
    }
    pullMessages() {
        const m = this.#messages;
        this.#messages = [];
        return m;
    }
}