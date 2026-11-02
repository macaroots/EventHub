import { NotFoundError } from "../../../shared/domain/errors.js";
import { Activity, ruleFromConfig } from "../domain/activity.js";

export class RegistrationAppService {
    constructor(activityRepository, registrationRepository, userRepository, eventRepository, messageBus) {
        this.activityRepository = activityRepository;
        this.registrationRepository = registrationRepository;
        this.userRepository = userRepository;
        this.eventRepository = eventRepository;
        this.messageBus = messageBus;
    }

    // Projeção local da Activity da secretaria (ActivityCreated/ActivityUpdated). Idempotente: upsert.
    upsertActivity({ activityId, eventId, capacity, rules = [] }) {
        const registrationRules = rules.map(ruleFromConfig);
        const activity = this.activityRepository.getById(activityId);
        if (!activity) {
            this.activityRepository.add(new Activity({ id: activityId, eventId, capacity, rules: registrationRules }));
        }
        else {
            activity.setCapacity(capacity);
            activity.setRules(registrationRules);
            this.activityRepository.update(activity);
        }
    }
    deleteActivity({ activityId }) {
        this.activityRepository.delete(activityId);
    }

    // Projeção do status do evento: só aceita inscrição em evento publicado.
    async updateEvent({ eventId, status, reason }) {
        this.eventRepository.update({ id: eventId, status });
        if (status != 'canceled') return;
        for (const activity of this.activityRepository.list().filter(a => a.eventId == eventId)) {
            activity.cancelAll(`Event canceled: ${reason}`);
            await this.#publish(activity.registrations);
        }
    }

    async register({ activityId }, user) {
        const activity = this.activityRepository.getById(activityId);
        if (!activity) throw new NotFoundError('activity');
        if (this.eventRepository.getById(activity.eventId)?.status != 'published') throw new Error('Event is not open for registration');
        if (!this.userRepository.getById(user.id)) throw new NotFoundError('user');
        const registration = activity.register(user);
        this.registrationRepository.add(registration);
        await this.#publish([registration]);
        return registration.toJSON();
    }

    async confirmPayment({ registrationId, paymentId }) {
        const registration = this.#get(registrationId);
        registration.fulfill(paymentId);
        await this.#publish([registration]);
    }
    async denyPayment({ registrationId, reason }) {
        const registration = this.#get(registrationId);
        registration.cancel(`Payment denied: ${reason}`);
        await this.#publish([registration]);
    }

    #get(id) {
        const registration = this.registrationRepository.getById(id);
        if (!registration) throw new NotFoundError('registration');
        return registration;
    }
    async #publish(registrations) {
        for (const r of registrations) for (const m of r.pullMessages()) await this.messageBus.publish(m);
    }
}
