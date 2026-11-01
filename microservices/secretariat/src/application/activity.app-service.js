import { NotFoundError } from "../../../shared/domain/errors.js";
import { Activity } from "../domain/activity.js";

// Integration events carregam só o que os outros contextos precisam (ver README).
const toMessage = (type, a) => ({ type, activityId: a.id, eventId: a.eventId, capacity: a.capacity, price: a.price });

export class ActivityAppService {
    constructor(activityRepository, eventRepository, messageBus) {
        this.activityRepository = activityRepository;
        this.eventRepository = eventRepository;
        this.messageBus = messageBus;
    }
    async create(data) {
        if (!this.eventRepository.getById(data.eventId)) throw new NotFoundError('event');
        const activity = new Activity(data);
        this.activityRepository.add(activity.toJSON());
        this.messageBus.publish(toMessage('ActivityCreated', activity));
        return activity.id;
    }

    async update(id, data) {
        const activity = this.#get(id);
        activity.update(data);
        this.activityRepository.update(activity.toJSON());
        this.messageBus.publish(toMessage('ActivityUpdated', activity));
    }

    async delete(id) {
        this.#get(id);
        this.activityRepository.delete(id);
        this.messageBus.publish({ type: 'ActivityDeleted', activityId: id });
    }

    #get(id) {
        const data = this.activityRepository.getById(id);
        if (!data) throw new NotFoundError('activity');
        return new Activity(data);
    }
}
