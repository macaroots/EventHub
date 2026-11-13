// Aviso de pendência histórico não significa que a compra ainda está pendente.
export function pendingPurchaseNotifications(items, registrations, payments, userId) {
    const awaiting = new Set(registrations.filter(r => r.userId === userId && r.status === 'awaiting_payment').map(r => r.id));
    const pending = new Set(payments.filter(p => p.userId === userId && p.status === 'pending').map(p => p.registrationId));
    return items.filter(item => item.event_type === 'PaymentRequested' && awaiting.has(item.registration_id) && pending.has(item.registration_id));
}
