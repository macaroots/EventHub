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
        const attendedUsers = new Set(attendances.map(a => a.userId));
        const denied = new Map();
        for (const activity of activities) {
            for (const registration of this.activityRepository.getById(activity.id).registrations) {
                if (registration.status !== 'confirmed' || attendedUsers.has(registration.userId)) continue;
                if (!denied.has(registration.userId)) denied.set(registration.userId, []);
                denied.get(registration.userId).push({ name: activity.name });
            }
        }
        this.messageBus.transaction(() => {
            this.eventRepository.update({ ...event, status: 'ended' });
            for (const m of this.policy.requests(event, activities, attendances, participants)) this.messageBus.publish(m);
            for (const [userId, activities] of denied) this.messageBus.publish({ type: 'CertificateDenied', userId, eventId: event.id, eventName: event.name, activities, reason: 'Nenhuma presença registrada nas atividades do evento.' });
        });
    }
}
