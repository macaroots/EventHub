import { DomainError } from "../../../shared/domain/errors.js";
// Entity. Presença de uma inscrição confirmada numa atividade: no máximo uma por inscrição (ADR 012).
// method: code (participante informou o código) | manual (marcada pelo organizador, checkedInBy).
export class Attendance {
    constructor({ id = crypto.randomUUID(), registrationId, activityId, userId, method, checkedInBy, checkedInAt = new Date().toISOString() }) {
        Object.assign(this, { id, registrationId, activityId, userId, method, checkedInBy, checkedInAt });
    }
    static of(registration, { method, by }) {
        if (registration.status != 'confirmed') throw new DomainError('Registration is not confirmed');
        const { id: registrationId, activityId, userId } = registration;
        return new Attendance({ registrationId, activityId, userId, method, checkedInBy: by });
    }
    toMessage() {
        const { id: attendanceId, registrationId, activityId, userId, method, checkedInAt } = this;
        return { type: 'AttendanceRegistered', attendanceId, registrationId, activityId, userId, method, checkedInAt };
    }
}
