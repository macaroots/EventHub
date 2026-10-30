import { DuplicateError } from "../../../../shared/domain/errors.js";
import { Event } from "../domain/event.js";

export class EventAppService {
    constructor(eventRepository, messageBus) {
        this.eventRepository = eventRepository;
        this.messageBus = messageBus;
    }
    async create({ name, capacity }) {
        let exist = this.eventRepository.findByName(name)
        if (exist) throw new DuplicateError('name');
        const event = new Event({name});
        await this.eventRepository.add(event.toJSON());
        this.messageBus.publish({type: 'EventCreated', eventId: event.id, name, capacity })
        return event.id;
    }
    
    async addActivity(eventId, activity) {
        const event = await this.eventRepository.getById(eventId);
        event.addActivity(activity);
        this.eventRepository.update(event);
        this.messageBus.publish({type: 'EventUpdated', activity})
    }
}

class EventUpdated {
    constructor(bean) {

    }
}