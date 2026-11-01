import { DuplicateError, NotFoundError } from "../../../shared/domain/errors.js";
import { Event } from "../domain/event.js";

export class EventAppService {
    constructor(eventRepository, activityRepository, messageBus) {
        this.eventRepository = eventRepository;
        this.activityRepository = activityRepository;
        this.messageBus = messageBus;
    }
    async create({ name }) {
        if (this.eventRepository.getByName(name)) throw new DuplicateError('name');
        const event = new Event({ name });
        this.eventRepository.add(event.toJSON());
        this.messageBus.publish({ type: 'EventCreated', eventId: event.id, name });
        return event.id;
    }

    async update(id, { name }) {
        const event = this.#get(id);
        const same = this.eventRepository.getByName(name);
        if (same && same.id != id) throw new DuplicateError('name');
        event.update({ name });
        this.eventRepository.update(event.toJSON());
        this.messageBus.publish({ type: 'EventUpdated', eventId: id, name });
    }

    async delete(id) {
        this.#get(id);
        if (this.activityRepository.listByEvent(id).length) throw new Error('Event has activities');
        this.eventRepository.delete(id);
        this.messageBus.publish({ type: 'EventDeleted', eventId: id });
    }

    #get(id) {
        const data = this.eventRepository.getById(id);
        if (!data) throw new NotFoundError('event');
        return new Event(data);
    }
}
