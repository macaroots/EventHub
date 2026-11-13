import { ConcurrencyError, DomainError, ForbiddenError, NotFoundError } from "../../../shared/domain/errors.js";
import { Activity } from "../domain/activity.js";
import { Participant } from "../domain/participant.js";
import { ruleFromConfig } from "../domain/rules/rule-from-config.js";
import { canManage, isAdmin } from "./permissions.js";

const isOwner = (user, registration) => registration.userId == user.id;
// Pendências que o organizador resolve na mão.
const MANUAL_REQUIREMENTS = ['age verification'];
const RETRIES = 20;

export class RegistrationAppService {
    // paymentWindowMinutes: quanto tempo a vaga fica reservada esperando o pagamento.
    // attendanceRepository: presença (check-in, ADR 012) mostrada junto com a inscrição.
    constructor(activityRepository, registrationRepository, participantRepository, eventRepository, messageBus, { paymentWindowMinutes = 2, attendanceRepository, checkInRepository } = {}) {
        this.attendanceRepository = attendanceRepository;
        this.checkInRepository = checkInRepository;
        this.activityRepository = activityRepository;
        this.registrationRepository = registrationRepository;
        this.participantRepository = participantRepository;
        this.eventRepository = eventRepository;
        this.messageBus = messageBus;
        this.paymentWindowMs = paymentWindowMinutes * 60_000;
    }

    // EventPublished: cópia imutável do evento e das atividades (a secretaria não muda o publicado).
    // Idempotente: mensagem repetida não recria nada. As atividades entram antes do evento,
    // que é o que libera as inscrições.
    publishEvent({ eventId, name, organizers = [], activities = [] }) {
        if (this.eventRepository.getById(eventId)) return;
        for (const { activityId, name, startsAt, endsAt, capacity, price, rules = [] } of activities) {
            if (this.activityRepository.getById(activityId)) continue;
            this.activityRepository.add(new Activity({ id: activityId, eventId, name, startsAt, endsAt, capacity, price, rules: rules.map(ruleFromConfig) }));
        }
        this.eventRepository.add({ id: eventId, name, status: 'published', organizers });
    }
    // Evento cancelado em rascunho nunca chegou aqui: ignora.
    async cancelEvent({ eventId, reason }) {
        const event = this.eventRepository.getById(eventId);
        if (!event || event.status == 'canceled') return;
        this.eventRepository.update({ ...event, status: 'canceled' });
        for (const activityId of this.activityRepository.listIdsByEvent(eventId)) {
            await this.#change(activityId, activity => activity.cancelAll(`Event canceled: ${reason}`));
        }
    }
    // Organizadores autorizam a gestão das inscrições.
    changeOrganizers({ eventId, organizers }) {
        const event = this.eventRepository.getById(eventId);
        if (event) this.eventRepository.update({ ...event, organizers });
    }

    // Projeção do User do identity. Idempotente: upsert.
    upsertParticipant({ userId, name }) {
        this.participantRepository.upsert(new Participant({ id: userId, name }));
    }

    async register({ activityId }, userId, participantName = userId) {
        // A projeção de participantes pode chegar depois do login; a inscrição
        // deve depender do usuário autenticado, não da sincronização do evento.
        if (!this.participantRepository.getById(userId)) {
            this.upsertParticipant({ userId, name: participantName || userId });
        }
        const registration = await this.#change(activityId, activity => {
            if (this.eventRepository.getById(activity.eventId)?.status != 'published') throw new DomainError('Event is not open for registration');
            return activity.register(userId);
        });
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
                present: this.attendanceRepository?.listByActivity(activity.id).length ?? 0,
            },
            event: event && { id: event.id, name: event.name, status: event.status },
            registrations: activity.registrations.map(r => this.#view(r)),
        };
    }
    // Ordem da fila de espera, só ids (sem dados pessoais): o BFF calcula a posição com cache por atividade (ADR 009).
    getWaitlist(activityId) {
        const activity = this.activityRepository.getById(activityId);
        if (!activity) throw new NotFoundError('activity');
        return activity.getWaitlist().map(r => r.id);
    }
    // O participante cancela a própria; o organizador, qualquer uma da atividade.
    async cancelRegistration(id, { reason } = {}, user) {
        const { activityId } = this.#get(id);
        const registration = await this.#change(activityId, activity => {
            const registration = activity.registrations.find(r => r.id == id);
            const owner = isOwner(user, registration);
            if (!owner && !this.#canManage(activityId, user)) throw new ForbiddenError('cancel registration');
            return activity.cancel(id, reason || (owner ? 'Canceled by participant' : 'Canceled by organizer'));
        });
        return this.#view(registration);
    }
    // O organizador resolve uma pendência manual (ex.: idade conferida no credenciamento).
    async fulfillRequirement(id, requirementId, user) {
        const { activityId } = this.#get(id);
        this.#assertCanManage(activityId, user);
        const registration = await this.#change(activityId, activity => {
            const requirement = activity.registrations.find(r => r.id == id).requirements.find(r => r.id == requirementId);
            if (!requirement) throw new NotFoundError('requirement');
            if (!MANUAL_REQUIREMENTS.includes(requirement.type)) throw new DomainError(`Requirement ${requirement.type} cannot be fulfilled manually`);
            return activity.fulfill(id, requirementId);
        });
        return this.#view(registration);
    }

    // Pago depois de perder a reserva: a inscrição não muda (estorno não implementado).
    async confirmPayment({ registrationId, paymentId }) {
        const { activityId } = this.#get(registrationId);
        await this.#change(activityId, activity => activity.confirmPayment(registrationId, paymentId));
    }
    async denyPayment({ registrationId, paymentId, reason }) {
        const { activityId } = this.#get(registrationId);
        await this.#change(activityId, activity => activity.denyPayment(registrationId, paymentId, reason));
    }
    // Job: reservas sem pagamento dentro da janela perdem a vaga, que vai para o próximo da fila.
    async expireOverduePayments(now = new Date()) {
        const before = new Date(now - this.paymentWindowMs);
        for (const activityId of this.registrationRepository.listActivitiesWithOverduePayment(before)) {
            await this.#change(activityId, activity => activity.expireOverdue(before));
        }
    }

    // Carrega, muda e salva a Activity; se outra escrita chegou antes (ConcurrencyError), refaz do zero.
    // Mensagens vão para o outbox na mesma transação do aggregate.
    async #change(activityId, fn) {
        for (let attempt = 1; ; attempt++) {
            const activity = this.activityRepository.getById(activityId);
            if (!activity) throw new NotFoundError('activity');
            const result = fn(activity);
            try {
                this.messageBus.transaction(() => {
                    for (const r of activity.registrations) if (r.payment?.requestedAt && !r.payment.expiresAt) r.payment.expiresAt = new Date(Date.parse(r.payment.requestedAt) + this.paymentWindowMs).toISOString();
                    this.activityRepository.update(activity);
                    for (const r of activity.registrations) for (const m of r.pullMessages()) {
                        this.messageBus.publish(m.type === 'PaymentRequested' ? { ...m, expiresAt: r.payment.expiresAt } : m);
                        if (m.type === 'RegistrationConfirmed') {
                            const checkIn = this.checkInRepository?.getById(activity.id);
                            if (checkIn?.status === 'open') this.messageBus.publish({ type: 'CheckInOpened', registrationId: r.id, userId: r.userId, activityId: activity.id, activityName: activity.name, code: checkIn.code, openedAt: checkIn.openedAt });
                        }
                    }
                });
            } catch (e) {
                if (!(e instanceof ConcurrencyError) || attempt == RETRIES) throw e;
                await new Promise(ok => setTimeout(ok, Math.random() * Math.min(200, 2 ** attempt))); // backoff exponencial com jitter
                continue;
            }
            return result;
        }
    }

    // Junta as projeções (participante, atividade, evento) para exibição.
    #view(r) {
        const activity = this.activityRepository.getById(r.activityId);
        const event = activity && this.eventRepository.getById(activity.eventId);
        return {
            ...r.toJSON(),
            waitlistPosition: activity?.getWaitlistPosition(r.id) ?? null,
            participant: this.participantRepository.getById(r.userId),
            attendance: this.attendanceRepository?.getByRegistration(r.id) ?? null,
            activity: activity && { id: activity.id, name: activity.name },
            event: event && { id: event.id, name: event.name, status: event.status },
        };
    }
    #canManage(activityId, user) {
        return canManage(this.activityRepository, this.eventRepository, activityId, user);
    }
    #assertCanManage(activityId, user) {
        if (!this.#canManage(activityId, user)) throw new ForbiddenError('manage registrations');
    }
    #get(id) {
        const registration = this.registrationRepository.getById(id);
        if (!registration) throw new NotFoundError('registration');
        return registration;
    }
}
