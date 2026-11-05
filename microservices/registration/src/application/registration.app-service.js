import { ForbiddenError, NotFoundError } from "../../../shared/domain/errors.js";
import { Activity, Participant, ruleFromConfig } from "../domain/activity.js";

const canSee = (user, registration) => user.role == 'admin' || registration.userId == user.id;

export class RegistrationAppService {
    constructor(activityRepository, registrationRepository, participantRepository, eventRepository, messageBus) {
        this.activityRepository = activityRepository;
        this.registrationRepository = registrationRepository;
        this.participantRepository = participantRepository;
        this.eventRepository = eventRepository;
        this.messageBus = messageBus;
    }

    // Projeção local da Activity da secretaria (ActivityCreated/ActivityUpdated). Idempotente: upsert.
    upsertActivity({ activityId, eventId, name, capacity, price = 0, rules = [] }) {
        const registrationRules = rules.map(ruleFromConfig);
        const activity = this.activityRepository.getById(activityId);
        if (!activity) {
            this.activityRepository.add(new Activity({ id: activityId, eventId, name, capacity, price, rules: registrationRules }));
        }
        else {
            activity.setName(name);
            activity.setCapacity(capacity);
            activity.setPrice(price);
            activity.setRules(registrationRules);
            this.activityRepository.update(activity);
        }
    }
    deleteActivity({ activityId }) {
        this.activityRepository.delete(activityId);
    }

    // Projeção do status do evento: só aceita inscrição em evento publicado.
    async updateEvent({ eventId, name, status, reason }) {
        this.eventRepository.upsert({ id: eventId, name, status });
        if (status != 'canceled') return;
        for (const activity of this.activityRepository.list().filter(a => a.eventId == eventId)) {
            activity.cancelAll(`Event canceled: ${reason}`);
            this.activityRepository.update(activity);
            await this.#publish(activity.registrations);
        }
    }

    // Projeção do User do identity. Idempotente: upsert.
    upsertParticipant({ userId, username }) {
        this.participantRepository.upsert(new Participant({ id: userId, username }));
    }

    async register({ activityId }, userId) {
        const activity = this.activityRepository.getById(activityId);
        if (!activity) throw new NotFoundError('activity');
        if (this.eventRepository.getById(activity.eventId)?.status != 'published') throw new Error('Event is not open for registration');
        if (!this.participantRepository.getById(userId)) throw new NotFoundError('user');
        const registration = activity.register(userId);
        this.activityRepository.update(activity); // salva a activity com a nova inscrição
        await this.#publish([registration]);
        return registration.toJSON();
    }

    // Admin vê todas; os demais, só as próprias.
    listRegistrations(user) {
        return this.registrationRepository.list()
            .filter(r => canSee(user, r))
            .map(r => this.#view(r));
    }
    getRegistration(id, user) {
        const registration = this.#get(id);
        if (!canSee(user, registration)) throw new ForbiddenError('see registration');
        return this.#view(registration);
    }

    async confirmPayment({ registrationId, paymentId }) {
        const registration = this.#get(registrationId);
        registration.fulfill(paymentId);
        this.registrationRepository.update(registration);
        await this.#publish([registration]);
    }
    async denyPayment({ registrationId, reason }) {
        const registration = this.#get(registrationId);
        registration.cancel(`Payment denied: ${reason}`);
        this.registrationRepository.update(registration);
        await this.#publish([registration]);
    }

    // Junta as projeções (participante, atividade, evento) para exibição.
    #view(r) {
        const activity = this.activityRepository.getById(r.activityId);
        const event = activity && this.eventRepository.getById(activity.eventId);
        return {
            ...r.toJSON(),
            participant: this.participantRepository.getById(r.userId),
            activity: activity && { id: activity.id, name: activity.name },
            event: event && { id: event.id, name: event.name },
        };
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
