import { BlankError, NotFoundError } from "../../../shared/domain/errors.js";
import { Activity } from "../domain/activity.js";
import { Event } from "../domain/event.js";

// Permissão herdada do Event: quem gerencia o evento gerencia suas atividades.
// Sem mensagens: as atividades só saem daqui na publicação do evento (EventPublished).
export class ActivityAppService {
    constructor(activityRepository, eventRepository) {
        this.activityRepository = activityRepository;
        this.eventRepository = eventRepository;
    }
    async create(data, user) {
        this.#getEvent(data.eventId, user).assertEditable();
        const activity = Activity.create(data);
        this.activityRepository.add(activity.toJSON());
        return activity.id;
    }

    async list({ eventId } = {}, user) {
        if (!eventId) throw new BlankError('eventId');
        this.#getEvent(eventId, user);
        return this.activityRepository.listByEvent(eventId);
    }

    // eventStatus: a tela só permite editar em rascunho.
    async get(id, user) {
        const activity = this.#get(id);
        const event = this.#getEvent(activity.eventId, user);
        return { ...activity.toJSON(), eventStatus: event.status };
    }

    async update(id, data, user) {
        const activity = this.#get(id);
        this.#getEvent(activity.eventId, user).assertEditable();
        activity.update(data);
        this.activityRepository.update(activity.toJSON());
    }

    async delete(id, user) {
        const activity = this.#get(id);
        this.#getEvent(activity.eventId, user).assertEditable();
        this.activityRepository.delete(id);
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
