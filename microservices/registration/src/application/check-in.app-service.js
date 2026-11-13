import { DomainError, ForbiddenError, NotFoundError } from "../../../shared/domain/errors.js";
import { Attendance } from "../domain/attendance.js";
import { CheckIn } from "../domain/check-in.js";
import { canManage } from "./permissions.js";

// Check-in (RF09, ADR 012): o organizador abre o check-in da atividade e mostra o código na sala;
// o participante confirmado informa o código, ou o organizador marca a presença na mão.
// Fora do aggregate Activity: não disputa o lock com as inscrições.
export class CheckInAppService {
    constructor({ activityRepository, registrationRepository, eventRepository, participantRepository, checkInRepository, attendanceRepository, messageBus }) {
        Object.assign(this, { activityRepository, registrationRepository, eventRepository, participantRepository, checkInRepository, attendanceRepository, messageBus });
    }

    // Abre ou gera um código novo (o anterior deixa de valer).
    open(activityId, user) {
        this.#assertOpenEvent(this.#manageable(activityId, user));
        const checkIn = this.checkInRepository.getById(activityId) ?? new CheckIn({ id: activityId });
        checkIn.open(new Date(Math.max(Date.now(), checkIn.openedAt ? Date.parse(checkIn.openedAt) + 1 : 0)));
        this.messageBus.transaction(() => {
            this.checkInRepository.upsert(checkIn);
            for (const registration of this.registrationRepository.listByActivity(activityId)) {
                if (registration.status === 'confirmed') this.messageBus.publish({
                    type: 'CheckInOpened', registrationId: registration.id, userId: registration.userId,
                    activityId, activityName: this.activityRepository.getHeader(activityId).name,
                    code: checkIn.code, openedAt: checkIn.openedAt,
                });
            }
        });
        return this.get(activityId, user);
    }
    close(activityId, user) {
        this.#manageable(activityId, user);
        const checkIn = this.checkInRepository.getById(activityId);
        if (checkIn) {
            const closedAt = new Date(Math.max(Date.now(), Date.parse(checkIn.openedAt || 0) + 1)).toISOString();
            checkIn.close();
            this.messageBus.transaction(() => {
                this.checkInRepository.update(checkIn);
                for (const registration of this.registrationRepository.listByActivity(activityId)) {
                    if (registration.status === 'confirmed') this.messageBus.publish({ type: 'CheckInClosed', registrationId: registration.id, userId: registration.userId, activityId, closedAt });
                }
            });
        }
        return this.get(activityId, user);
    }

    // Painel do organizador: código, confirmados e presenças (comparecimento, RF11).
    get(activityId, user) {
        const activity = this.#manageable(activityId, user);
        const event = this.eventRepository.getById(activity.eventId);
        const checkIn = this.checkInRepository.getById(activityId) ?? new CheckIn({ id: activityId });
        const attendances = new Map(this.attendanceRepository.listByActivity(activityId).map(a => [a.registrationId, a]));
        // Confirmados, mais quem fez check-in e cancelou depois (a presença continua valendo).
        const attendees = this.registrationRepository.listByActivity(activityId)
            .filter(r => r.status == 'confirmed' || attendances.has(r.id))
            .map(r => ({
                registrationId: r.id, userId: r.userId, status: r.status,
                participant: this.participantRepository.getById(r.userId) ?? null,
                attendance: attendances.get(r.id) ?? null,
            }));
        return {
            activity: { id: activity.id, name: activity.name },
            event: event && { id: event.id, name: event.name, status: event.status },
            checkIn: { status: checkIn.status, code: checkIn.code, openedAt: checkIn.openedAt },
            confirmed: attendees.filter(a => a.status == 'confirmed').length,
            present: attendances.size,
            attendees,
        };
    }

    // Participante logado informa o código mostrado na sala.
    async checkIn({ activityId, code }, user) {
        const activity = this.activityRepository.getHeader(activityId);
        if (!activity) throw new NotFoundError('activity');
        this.#assertOpenEvent(activity);
        if (!this.checkInRepository.getById(activityId)?.accepts(code)) throw new DomainError('Check-in closed or invalid code');
        const registration = this.registrationRepository.findActive(activityId, user.id);
        if (!registration) throw new ForbiddenError('check in without a registration in this activity');
        return this.#attend(registration, { method: 'code', by: user.id });
    }
    // Organizador marca a presença de um inscrito confirmado (sem código).
    async checkInManually(registrationId, user) {
        const registration = this.registrationRepository.getById(registrationId);
        if (!registration) throw new NotFoundError('registration');
        this.#assertOpenEvent(this.#manageable(registration.activityId, user));
        return this.#attend(registration, { method: 'manual', by: user.id });
    }

    // Idempotente: a segunda vez devolve a presença existente (alreadyCheckedIn) e não publica de novo.
    async #attend(registration, by) {
        const { attendance, created } = this.messageBus.transaction(() => {
            const result = this.attendanceRepository.addOnce(Attendance.of(registration, by));
            if (result.created) this.messageBus.publish(result.attendance.toMessage());
            return result;
        });
        return { ...attendance, alreadyCheckedIn: !created };
    }
    #manageable(activityId, user) {
        const activity = this.activityRepository.getHeader(activityId);
        if (!activity) throw new NotFoundError('activity');
        if (!canManage(this.activityRepository, this.eventRepository, activityId, user)) throw new ForbiddenError('manage check-in');
        return activity;
    }
    #assertOpenEvent(activity) {
        if (this.eventRepository.getById(activity.eventId)?.status != 'published') throw new DomainError('Event is not published');
    }
}
