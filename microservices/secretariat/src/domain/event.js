import { BlankError, ForbiddenError } from "../../../shared/domain/errors.js"

export const isAdmin = (user) => user?.role == 'admin';

const assertDate = (field, v) => { if (v != null && isNaN(Date.parse(v))) throw new TypeError(`${field} must be an ISO date`) };

// A programação (atividades) não fica dentro do Event: cada Activity referencia seu eventId.
// Estado privado: só muda pelos métodos, que validam.
export class Event {
    #id;
    #name;
    #information;
    #location;
    #startDate;
    #endDate;
    #status; // draft | published | ended | canceled
    #cancelReason;
    #createdBy;
    #organizers;

    // Reconstituição (banco). Para um evento novo, use Event.create().
    constructor({ id, name, information, location, startDate, endDate, status, cancelReason, createdBy, organizers }) {
        if (!id) throw new BlankError('id');
        if (!createdBy) throw new BlankError('createdBy');
        this.#id = id;
        this.#setName(name);
        this.#information = information;
        this.#location = location ?? null;
        this.#setPeriod(startDate, endDate);
        this.#status = status;
        this.#cancelReason = cancelReason;
        this.#createdBy = createdBy;
        this.#organizers = [...organizers];
    }
    // Nasce em draft; o criador é o primeiro organizer.
    static create({ name, information, location, startDate, endDate, createdBy }) {
        return new Event({ id: crypto.randomUUID(), name, information, location, startDate, endDate, status: 'draft', createdBy, organizers: [createdBy] });
    }

    get id() { return this.#id; }
    get status() { return this.#status; }

    // PATCH: altera só os campos enviados; status, organizers e createdBy só mudam pelos métodos de domínio.
    update({ name, information, location, startDate, endDate }) {
        this.assertEditable();
        if (name !== undefined) this.#setName(name);
        if (information !== undefined) this.#information = information;
        if (location !== undefined) this.#location = location;
        if (startDate !== undefined || endDate !== undefined) this.#setPeriod(startDate === undefined ? this.#startDate : startDate, endDate === undefined ? this.#endDate : endDate);
    }

    #setName(name) {
        if (!name) throw new BlankError('name');
        this.#name = name;
    }
    #setPeriod(startDate, endDate) {
        assertDate('startDate', startDate);
        assertDate('endDate', endDate);
        if (startDate && endDate && endDate < startDate) throw new TypeError('endDate must be after startDate');
        this.#startDate = startDate;
        this.#endDate = endDate;
    }

    publish() {
        if (this.#status != 'draft') throw new Error(`Cannot publish a ${this.#status} event`);
        if (!this.#startDate) throw new BlankError('startDate');
        this.#status = 'published';
    }
    // Encerrado pelo organizador depois do endDate: libera a emissão dos certificados no registration.
    // Manual, para dar tempo de corrigir presenças antes.
    end(now = new Date()) {
        if (this.#status != 'published') throw new Error(`Cannot end a ${this.#status} event`);
        if (now < new Date(this.#endDate)) throw new Error('Event has not reached its endDate');
        this.#status = 'ended';
    }
    cancel(reason) {
        if (this.#status == 'canceled') throw new Error('Event already canceled');
        if (this.#status == 'ended') throw new Error('Cannot cancel an ended event');
        if (!reason) throw new BlankError('reason');
        this.#status = 'canceled';
        this.#cancelReason = reason;
    }
    // Publicado tem inscrições: precisa ser cancelado antes. Encerrado é histórico (certificados).
    assertDeletable() {
        if (this.#status == 'published') throw new Error('Cancel the event before deleting it');
        if (this.#status == 'ended') throw new Error('Cannot delete an ended event');
    }
    // Conteúdo (evento e atividades) só muda em rascunho: o publicado é o contrato com os inscritos.
    assertEditable() {
        if (this.#status != 'draft') throw new Error(`Cannot change a ${this.#status} event`);
    }

    // Organizadores não são conteúdo publicado: mudam até o cancelamento.
    #assertManageable() {
        if (this.#status == 'canceled') throw new Error('Event is canceled');
    }
    addOrganizer(userId) {
        this.#assertManageable();
        if (!userId) throw new BlankError('userId');
        if (!this.#organizers.includes(userId)) this.#organizers.push(userId);
    }
    removeOrganizer(userId) {
        this.#assertManageable();
        if (userId == this.#createdBy) throw new Error('Cannot remove the creator');
        this.#organizers = this.#organizers.filter(o => o != userId);
    }

    // Políticas de acesso: admin pode tudo; organizer gerencia; só o criador apaga.
    canManage(user) { return isAdmin(user) || this.#organizers.includes(user.id); }
    canDelete(user) { return isAdmin(user) || this.#createdBy == user.id; }
    assertCanManage(user) { if (!this.canManage(user)) throw new ForbiddenError('manage this event'); }
    assertCanDelete(user) { if (!this.canDelete(user)) throw new ForbiddenError('delete this event'); }

    toJSON() {
        return {
            id: this.#id,
            name: this.#name,
            information: this.#information,
            location: this.#location,
            startDate: this.#startDate,
            endDate: this.#endDate,
            status: this.#status,
            cancelReason: this.#cancelReason,
            createdBy: this.#createdBy,
            organizers: [...this.#organizers],
        };
    }
}
