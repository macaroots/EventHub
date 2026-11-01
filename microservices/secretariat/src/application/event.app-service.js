import { DuplicateError, NotFoundError } from "../../../shared/domain/errors.js";
import { Event, isAdmin } from "../domain/event.js";

// Integration events: só dados públicos (sem organizers).
const toMessage = (type, e) => {
    const { id, name, description, location, startDate, endDate, status } = e.toJSON();
    return { type, eventId: id, name, description, location, startDate, endDate, status };
};

export class EventAppService {
    constructor(eventRepository, activityRepository, messageBus) {
        this.eventRepository = eventRepository;
        this.activityRepository = activityRepository;
        this.messageBus = messageBus;
    }

    // Qualquer usuário logado cria; vira createdBy e primeiro organizer.
    async create(data, user) {
        this.#assertUniqueName(data.name);
        const event = new Event({ ...data, id: undefined, status: undefined, organizers: undefined, createdBy: user.id });
        this.eventRepository.add(event.toJSON());
        this.messageBus.publish(toMessage('EventCreated', event));
        return event.id;
    }

    // Admin vê todos; os demais, só os eventos de que são organizers.
    async list({ name } = {}, user) {
        return this.eventRepository.search({ name, organizerId: isAdmin(user) ? undefined : user.id });
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
        this.#save(event, 'EventUpdated');
    }

    async publish(id, user) {
        const event = this.#get(id);
        event.assertCanManage(user);
        if (!this.activityRepository.listByEvent(id).length) throw new Error('Event has no activities');
        event.publish();
        this.#save(event, 'EventPublished');
    }

    async cancel(id, { reason } = {}, user) {
        const event = this.#get(id);
        event.assertCanManage(user);
        event.cancel(reason);
        this.eventRepository.update(event.toJSON());
        this.messageBus.publish({ ...toMessage('EventCanceled', event), reason });
    }

    async addOrganizer(id, { userId } = {}, user) {
        const event = this.#get(id);
        event.assertCanManage(user);
        event.addOrganizer(userId);
        this.eventRepository.update(event.toJSON());
    }

    async removeOrganizer(id, userId, user) {
        const event = this.#get(id);
        event.assertCanManage(user);
        event.removeOrganizer(userId);
        this.eventRepository.update(event.toJSON());
    }

    // Só o criador (ou admin); apaga junto as atividades.
    async delete(id, user) {
        const event = this.#get(id);
        event.assertCanDelete(user);
        event.assertDeletable();
        for (const { id: activityId } of this.activityRepository.listByEvent(id)) {
            this.activityRepository.delete(activityId);
            this.messageBus.publish({ type: 'ActivityDeleted', activityId });
        }
        this.eventRepository.delete(id);
        this.messageBus.publish({ type: 'EventDeleted', eventId: id });
    }

    #save(event, messageType) {
        this.eventRepository.update(event.toJSON());
        this.messageBus.publish(toMessage(messageType, event));
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
