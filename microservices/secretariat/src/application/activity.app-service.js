import { BlankError, NotFoundError } from "../../../shared/domain/errors.js";
import { Activity } from "../domain/activity.js";
import { Event } from "../domain/event.js";

// Integration events carregam só o que os outros contextos precisam (ver README).
const toMessage = (type, a) => {
    const { id, eventId, name, startsAt, endsAt, capacity, price, rules } = a.toJSON();
    return { type, activityId: id, eventId, name, startsAt, endsAt, capacity, price, rules };
};

// Permissão herdada do Event: quem gerencia o evento gerencia suas atividades.
export class ActivityAppService {
    constructor(activityRepository, eventRepository, messageBus) {
        this.activityRepository = activityRepository;
        this.eventRepository = eventRepository;
        this.messageBus = messageBus;
    }
    async create(data, user) {
        const event = this.#getEvent(data.eventId, user);
        event.assertEditable();
        const activity = Activity.create(data);
        this.activityRepository.add(activity.toJSON());
        this.messageBus.publish(toMessage('ActivityCreated', activity));
        return activity.id;
    }

    async list({ eventId } = {}, user) {
        if (!eventId) throw new BlankError('eventId');
        this.#getEvent(eventId, user);
        return this.activityRepository.listByEvent(eventId);
    }

    async get(id, user) {
        const activity = this.#get(id);
        this.#getEvent(activity.eventId, user);
        return activity.toJSON();
    }

    async update(id, data, user) {
        const activity = this.#get(id);
        this.#getEvent(activity.eventId, user).assertEditable();
        activity.update(data);
        this.activityRepository.update(activity.toJSON());
        this.messageBus.publish(toMessage('ActivityUpdated', activity));
    }

    // Só em evento não publicado: depois de publicado pode haver inscrições.
    async delete(id, user) {
        const activity = this.#get(id);
        const event = this.#getEvent(activity.eventId, user);
        if (event.status == 'published') throw new Error('Cannot delete an activity of a published event');
        this.activityRepository.delete(id);
        this.messageBus.publish({ type: 'ActivityDeleted', activityId: id });
    }

    #get(id) {
        const data = this.activityRepository.getById(id);
        if (!data) throw new NotFoundError('activity');
        return new Activity(data);
    }
    #getEvent(eventId, user) {
        const data = eventId && this.eventRepository.getById(eventId);
        if (!data) throw new NotFoundError('event');
        const event = new Event(data);
        event.assertCanManage(user);
        return event;
    }
}
