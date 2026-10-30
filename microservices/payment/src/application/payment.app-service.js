import { NotFoundError } from "../../../shared/domain/errors.js";
import { Payment } from "../domain/payment.js";

export class PaymentAppService {
    constructor(paymentRepository, messageBus) {
        this.paymentRepository = paymentRepository;
        this.messageBus = messageBus;
    }
    charge({paymentId, amount}) {
        this.paymentRepository.add(new Payment(amount, paymentId));
    }
    pay({paymentId, receipt}) {
        const payment = this.paymentRepository.getById(paymentId);
        if (!payment) throw new NotFoundError('payment');
        // TODO
        if (receipt == 'nao') {
            payment.deny('erro');
        }
        else {
            payment.pay(receipt);
        }
        this.#sendMessages(payment);
    }

    async #sendMessages(payment) {
        for (const m of payment.pullMessages()) await this.messageBus.publish(m);
    }
}