import { CertificatePolicy } from "../domain/certificate-policy.js";

// EventEnded (secretaria): encerra a cópia do evento e pede os certificados de quem tem direito (ADR 003).
// Encerrado, o check-in não abre mais: as correções de presença têm de vir antes.
export class CertificateAppService {
    constructor({ activityRepository, eventRepository, participantRepository, attendanceRepository, messageBus, policy = new CertificatePolicy() }) {
        Object.assign(this, { activityRepository, eventRepository, participantRepository, attendanceRepository, messageBus, policy });
    }

    // Idempotente: evento já encerrado (ou desconhecido, ou cancelado) não pede de novo.
    endEvent({ eventId }) {
        const event = this.eventRepository.getById(eventId);
        if (event?.status != 'published') return;
        const activities = this.activityRepository.listHeadersByEvent(eventId);
        const attendances = activities.flatMap(a => this.attendanceRepository.listByActivity(a.id));
        const participants = new Map(attendances.map(({ userId }) => [userId, this.participantRepository.getById(userId)]));
        this.messageBus.transaction(() => {
            this.eventRepository.update({ ...event, status: 'ended' });
            for (const m of this.policy.requests(event, activities, attendances, participants)) this.messageBus.publish(m);
        });
    }
}
