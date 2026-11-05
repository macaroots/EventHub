// Posição na fila de espera (ADR 009). Polling com cache por atividade; para migrar ao push (SSE),
// troca-se o WaitlistSource por um alimentado por mensagem, e o payload de status continua o mesmo.

// Ordem da fila por atividade, com cache curto: o registration recebe uma consulta por atividade
// a cada `ttlMs`, não uma por pessoa. Consultas simultâneas compartilham a mesma promessa.
// `req` só leva o token de quem pergunta: a fila é igual para todos.
export class PollingWaitlistSource {
    #cache = new Map(); // activityId -> { at, ids: Promise<string[]> }
    constructor(fetchWaitlist, { ttlMs = 2000, now = Date.now } = {}) { // fetchWaitlist(activityId, req) => ids
        this.fetchWaitlist = fetchWaitlist;
        this.ttlMs = ttlMs;
        this.now = now;
    }
    get(activityId, req) {
        const cached = this.#cache.get(activityId);
        if (cached && this.now() - cached.at < this.ttlMs) return cached.ids;
        const ids = this.fetchWaitlist(activityId, req);
        this.#cache.set(activityId, { at: this.now(), ids });
        ids.catch(() => this.#cache.delete(activityId)); // erro não fica em cache
        return ids;
    }
}

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
