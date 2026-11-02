import { BlankError, ForbiddenError } from "../../../shared/domain/errors.js"

export const isAdmin = (user) => user?.role == 'admin';

const isDate = (field) => (v) => { if (v != null && isNaN(Date.parse(v))) throw new TypeError(`${field} must be an ISO date`) };

// TODO não gostei dos validators. não seria melhor em um setter privado?
// Campos editáveis via update(); status, organizers e createdBy só mudam pelos métodos de domínio.
const validators = {
    name: (v) => { if (!v) throw new BlankError('name') },
    description: () => {},
    startDate: isDate('startDate'),
    endDate: isDate('endDate'),
};

// A programação (atividades) não fica dentro do Event: cada Activity referencia seu eventId.
// Estado privado: só muda pelos métodos, que validam.
export class Event {
    // TODO avaliar vantagens e profissionalismo
    #data;

    // data vem da API (create) ou do banco (reconstituição).
    constructor(data = {}) {
        if (!data.createdBy) throw new BlankError('createdBy');
        this.#data = {
            id: data.id || crypto.randomUUID(),
            status: data.status ?? 'draft', // draft | published | canceled
            cancelReason: data.cancelReason,
            createdBy: data.createdBy,
            organizers: [...(data.organizers ?? [data.createdBy])],
        };
        this.#apply(data);
        validators.name(this.#data.name);
    }
    get id() { return this.#data.id; }
    get status() { return this.#data.status; }

    // Altera só os campos enviados (PATCH); ignora os desconhecidos.
    update(data) {
        if (this.status == 'canceled') throw new Error('Event is canceled');
        this.#apply(data);
    }
    #apply(data) {
        const next = { ...this.#data };
        for (const [field, validate] of Object.entries(validators)) {
            if (data[field] === undefined) continue;
            validate(data[field]);
            next[field] = data[field];
        }
        if (next.startDate && next.endDate && next.endDate < next.startDate) throw new TypeError('endDate must be after startDate');
        this.#data = next;
    }

    publish() {
        if (this.status != 'draft') throw new Error(`Cannot publish a ${this.status} event`);
        if (!this.#data.startDate || !this.#data.endDate) throw new BlankError('startDate and endDate');
        this.#data.status = 'published';
    }
    cancel(reason) {
        if (this.status == 'canceled') throw new Error('Event already canceled');
        if (!reason) throw new BlankError('reason');
        this.#data.status = 'canceled';
        this.#data.cancelReason = reason;
    }
    // Publicado tem inscrições: precisa ser cancelado antes.
    assertDeletable() {
        if (this.status == 'published') throw new Error('Cancel the event before deleting it');
    }
    assertEditable() {
        if (this.status == 'canceled') throw new Error('Event is canceled');
    }

    addOrganizer(userId) {
        if (!userId) throw new BlankError('userId');
        if (!this.#data.organizers.includes(userId)) this.#data.organizers.push(userId);
    }
    removeOrganizer(userId) {
        if (userId == this.#data.createdBy) throw new Error('Cannot remove the creator');
        this.#data.organizers = this.#data.organizers.filter(o => o != userId);
    }

    // Políticas de acesso: admin pode tudo; organizer gerencia; só o criador apaga.
    canManage(user) { return isAdmin(user) || this.#data.organizers.includes(user.id); }
    canDelete(user) { return isAdmin(user) || this.#data.createdBy == user.id; }
    assertCanManage(user) { if (!this.canManage(user)) throw new ForbiddenError('manage this event'); }
    assertCanDelete(user) { if (!this.canDelete(user)) throw new ForbiddenError('delete this event'); }

    toJSON() { return { ...this.#data, organizers: [...this.#data.organizers] }; }
}
