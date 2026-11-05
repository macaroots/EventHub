import { ForbiddenError, NotFoundError } from "../../../shared/domain/errors.js";
import { Activity, Participant, ruleFromConfig } from "../domain/activity.js";

const isAdmin = (user) => user.role == 'admin';
const isOwner = (user, registration) => registration.userId == user.id;
// Pendências que o organizador resolve na mão. Pagamento só pelo payment; fila de espera pela vaga.
const MANUAL_REQUIREMENTS = ['age verification'];

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

    // Projeção do evento: status (só aceita inscrição em evento publicado) e organizers (gestão das inscrições).
    async updateEvent({ eventId, name, status, organizers = [], reason }) {
        this.eventRepository.upsert({ id: eventId, name, status, organizers });
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
            .filter(r => isAdmin(user) || isOwner(user, r))
            .map(r => this.#view(r));
    }
    // Dono, organizador do evento ou admin.
    getRegistration(id, user) {
        const registration = this.#get(id);
        if (!isOwner(user, registration) && !this.#canManage(registration.activityId, user)) throw new ForbiddenError('see registration');
        return this.#view(registration);
    }

    // Gestão (organizador do evento ou admin): inscrições da atividade com a ocupação.
    listActivityRegistrations(activityId, user) {
        const activity = this.activityRepository.getById(activityId);
        if (!activity) throw new NotFoundError('activity');
        this.#assertCanManage(activity.id, user);
        const event = this.eventRepository.getById(activity.eventId);
        return {
            activity: {
                id: activity.id, name: activity.name, capacity: activity.capacity, price: activity.price,
                occupation: activity.getOccupation(), confirmedOccupation: activity.getConfirmedOccupation(),
            },
            event: event && { id: event.id, name: event.name, status: event.status },
            registrations: activity.registrations.map(r => this.#view(r)),
        };
    }
    // O participante cancela a própria; o organizador, qualquer uma da atividade.
    async cancelRegistration(id, { reason } = {}, user) {
        const registration = this.#get(id);
        const owner = isOwner(user, registration);
        if (!owner && !this.#canManage(registration.activityId, user)) throw new ForbiddenError('cancel registration');
        registration.cancel(reason || (owner ? 'Canceled by participant' : 'Canceled by organizer'));
        this.registrationRepository.update(registration);
        await this.#publish([registration]);
        return this.#view(registration);
    }
    // O organizador resolve uma pendência manual (ex.: idade conferida no credenciamento).
    async fulfillRequirement(id, requirementId, user) {
        const registration = this.#get(id);
        this.#assertCanManage(registration.activityId, user);
        const requirement = registration.requirements.find(r => r.id == requirementId);
        if (!requirement) throw new NotFoundError('requirement');
        if (!MANUAL_REQUIREMENTS.includes(requirement.type)) throw new Error(`Requirement ${requirement.type} cannot be fulfilled manually`);
        registration.fulfill(requirementId);
        this.registrationRepository.update(registration);
        await this.#publish([registration]);
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
    #canManage(activityId, user) {
        if (isAdmin(user)) return true;
        const activity = this.activityRepository.getById(activityId);
        const event = activity && this.eventRepository.getById(activity.eventId);
        return !!event?.organizers.includes(user.id);
    }
    #assertCanManage(activityId, user) {
        if (!this.#canManage(activityId, user)) throw new ForbiddenError('manage registrations');
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
