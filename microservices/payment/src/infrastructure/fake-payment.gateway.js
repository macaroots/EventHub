// Adaptador fake do gateway de pagamento (porta: verify(payment, receipt) -> {approved, reason}).
// Trocar por um real (Stripe, Mercado Pago...) sem mexer no domínio. Recusa o comprovante 'nao'.
export class FakePaymentGateway {
    async verify(payment, receipt) {
        if (!receipt || receipt == 'deny') return { approved: false, reason: 'Denied by gateway' };
        return { approved: true };
    }
}
