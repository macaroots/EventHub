import { DuplicateError, NotFoundError } from "../../../shared/domain/errors.js";
import { Event, isAdmin } from "../domain/event.js";

// Integration events. Só o que é publicado sai daqui: rascunho é assunto interno da secretaria.
// EventPublished leva o retrato imutável do evento e das atividades (capacidade, preço, regras).
const publishedMessage = (event, activities) => {
    const { id, name, startDate, endDate, organizers } = event.toJSON();
    return {
        type: 'EventPublished', eventId: id, name, startDate, endDate, organizers,
        activities: activities.map(({ id, name, startsAt, endsAt, capacity, price, rules }) =>
            ({ activityId: id, name, startsAt, endsAt, capacity, price, rules })),
    };
};

const toPublic = ({ id, name, information, startDate, endDate, status }) =>
    ({ id, name, information, startDate, endDate, status });

export class EventAppService {
    constructor(eventRepository, activityRepository, messageBus) {
        this.eventRepository = eventRepository;
        this.activityRepository = activityRepository;
        this.messageBus = messageBus;
    }

    // Qualquer usuário logado cria; vira createdBy e primeiro organizer.
    async create(data, user) {
        this.#assertUniqueName(data.name);
        const event = Event.create({ ...data, createdBy: user.id });
        this.eventRepository.add(event.toJSON());
        return event.id;
    }

    // Admin vê todos; os demais, só os eventos de que são organizers.
    async list({ name } = {}, user) {
        return this.eventRepository.search({ name, organizerId: isAdmin(user) ? undefined : user.id });
    }
    // Públicos (sem login): só publicados e sem organizers.
    async listPublished({ name } = {}) {
        return this.eventRepository.search({ name, status: 'published' }).map(toPublic);
    }
    async getPublished(id) {
        const data = this.eventRepository.getById(id);
        if (data?.status != 'published') throw new NotFoundError('event');
        return { ...toPublic(data), activities: this.activityRepository.listByEvent(id) };
    }

    async get(id, user) {
        const event = this.#get(id);
        event.assertCanManage(user);
        return { ...event.toJSON(), activities: this.activityRepository.listByEvent(id) };
    }

    async update(id, data, user) {
        const event = this.#get(id);
        event.assertCanManage(user);
        if (data.name) this.#assertUniqueName(data.name, id);
        event.update(data);
        this.eventRepository.update(event.toJSON());
    }

    async publish(id, user) {
        const event = this.#get(id);
        event.assertCanManage(user);
        const activities = this.activityRepository.listByEvent(id);
        if (!activities.length) throw new Error('Event has no activities');
        event.publish();
        this.messageBus.transaction(() => {
            this.eventRepository.update(event.toJSON());
            this.messageBus.publish(publishedMessage(event, activities));
        });
    }

    // EventEnded: o registration avalia a elegibilidade e pede os certificados (ADR 003).
    async end(id, user, now = new Date()) {
        const event = this.#get(id);
        event.assertCanManage(user);
        event.end(now);
        this.messageBus.transaction(() => {
            this.eventRepository.update(event.toJSON());
            this.messageBus.publish({ type: 'EventEnded', eventId: id });
        });
    }

    async cancel(id, { reason } = {}, user) {
        const event = this.#get(id);
        event.assertCanManage(user);
        event.cancel(reason);
        this.messageBus.transaction(() => {
            this.eventRepository.update(event.toJSON());
            this.messageBus.publish({ type: 'EventCanceled', eventId: id, reason });
        });
    }

    async addOrganizer(id, { userId } = {}, user) {
        const event = this.#get(id);
        event.assertCanManage(user);
        event.addOrganizer(userId);
        this.#saveOrganizers(event);
    }

    async removeOrganizer(id, userId, user) {
        const event = this.#get(id);
        event.assertCanManage(user);
        event.removeOrganizer(userId);
        this.#saveOrganizers(event);
    }

    // Só o criador (ou admin); apaga junto as atividades. Sem mensagem: rascunho nunca saiu daqui,
    // e o cancelado continua no registration como histórico das inscrições.
    async delete(id, user) {
        const event = this.#get(id);
        event.assertCanDelete(user);
        event.assertDeletable();
        for (const { id: activityId } of this.activityRepository.listByEvent(id)) this.activityRepository.delete(activityId);
        this.eventRepository.delete(id);
    }

    // O registration usa os organizers para autorizar a gestão das inscrições; em rascunho, ele ainda não conhece o evento.
    #saveOrganizers(event) {
        this.messageBus.transaction(() => {
            this.eventRepository.update(event.toJSON());
            if (event.status == 'published') {
                this.messageBus.publish({ type: 'EventOrganizersChanged', eventId: event.id, organizers: event.toJSON().organizers });
            }
        });
    }
    #assertUniqueName(name, id) {
        const same = name && this.eventRepository.getByName(name);
        if (same && same.id != id) throw new DuplicateError('name');
    }
    #get(id) {
        const data = this.eventRepository.getById(id);
        if (!data) throw new NotFoundError('event');
        return new Event(data);
    }
}
