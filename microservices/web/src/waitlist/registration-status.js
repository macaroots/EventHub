// Posição na fila de espera (ADR 009): o payload {status, waitlistPosition, next} independe do transporte.

const MAX_ACCESS = 100_000;

// { status, waitlistPosition, next }: next é para onde a página vai quando sai da fila.
export class RegistrationStatus {
    // registrationId:userId -> activityId. Preenchido só depois de o registration autorizar (getRegistration),
    // para o polling não chamar o registration por pessoa enquanto ela está na fila.
    #access = new Map();
    // getRegistration(registrationId, req) => inscrição, se o usuário de req puder vê-la (senão, lança).
    constructor(getRegistration, waitlistSource) {
        this.getRegistration = getRegistration;
        this.waitlistSource = waitlistSource;
    }
    async get(registrationId, userId, req) {
        const key = `${registrationId}:${userId}`;
        const activityId = this.#access.get(key);
        if (activityId) {
            const position = (await this.waitlistSource.get(activityId, req)).indexOf(registrationId) + 1;
            if (position) return { status: 'waitlisted', waitlistPosition: position, next: null };
        }
        // Primeira consulta, ou saiu da lista em cache: pergunta ao registration (uma vez).
        const registration = await this.getRegistration(registrationId, req);
        if (registration.status == 'waitlisted') {
            if (this.#access.size >= MAX_ACCESS) this.#access.clear();
            this.#access.set(key, registration.activityId);
            return { status: 'waitlisted', waitlistPosition: registration.waitlistPosition, next: null };
        }
        this.#access.delete(key);
        return { status: registration.status, waitlistPosition: null, next: nextPage(registration) };
    }
}

const nextPage = (r) => r.status == 'awaiting_payment'
    ? `/payments/${encodeURIComponent(r.payment.id)}`
    : `/registrations/${encodeURIComponent(r.id)}`;
