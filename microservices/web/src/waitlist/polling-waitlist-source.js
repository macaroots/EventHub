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
