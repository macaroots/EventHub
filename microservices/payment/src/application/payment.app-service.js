import { NotFoundError } from "../../../shared/domain/errors.js";
import { Payment } from "../domain/payment.js";

export class PaymentAppService {
    constructor(paymentRepository, paymentGateway, messageBus) {
        this.paymentRepository = paymentRepository;
        this.paymentGateway = paymentGateway;
        this.messageBus = messageBus;
    }
    // Ouve PaymentRequested. Idempotente: mensagem repetida não duplica a cobrança.
    charge({ paymentId, amount, registrationId, description }) {
        if (this.paymentRepository.getById(paymentId)) return;
        this.paymentRepository.add(new Payment(amount, paymentId, { registrationId, description }));
    }
    // Ouve RegistrationCanceled.
    cancelByRegistration({ registrationId }) {
        for (const payment of this.paymentRepository.listByRegistration(registrationId)) {
            payment.cancel();
            this.paymentRepository.update(payment);
        }
    }
    async pay({ paymentId, receipt }) {
        const payment = this.paymentRepository.getById(paymentId);
        if (!payment) throw new NotFoundError('payment');
        const { approved, reason } = await this.paymentGateway.verify(payment, receipt);
        if (approved) payment.pay(receipt);
        else payment.deny(reason);
        this.messageBus.transaction(() => {
            this.paymentRepository.update(payment);
            for (const m of payment.pullMessages()) this.messageBus.publish(m);
        });
        return payment;
    }
}
