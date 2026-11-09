// Domain service. Quem tem direito a certificado ao encerrar o evento (ADR 003): o credenciamento decide,
// o serviço de certificados só emite. Critério provisório: um certificado por evento para quem fez check-in
// em ao menos uma atividade (inclusive se a inscrição foi cancelada depois), listando as atividades com presença.
// Trocar o critério é mexer só aqui.
export class CertificatePolicy {
    // activities: cabeçalhos das atividades do evento; attendances: presenças delas.
    // participants: userId → {name}. Devolve as mensagens CertificateRequested, uma por participante.
    requests(event, activities, attendances, participants) {
        const byId = new Map(activities.map(a => [a.id, a]));
        const byUser = Map.groupBy(attendances, a => a.userId);
        return [...byUser].map(([userId, attended]) => {
            const items = attended.map(attendance => {
                const activity = byId.get(attendance.activityId);
                return {
                    activityId: activity.id,
                    name: activity.name,
                    workload: workloadHours(activity),
                    date: (activity.startsAt ?? attendance.checkedInAt).slice(0, 10),
                };
            }).sort((a, b) => a.date.localeCompare(b.date));
            return {
                type: 'CertificateRequested',
                requestId: `${event.id}:${userId}`, // um por participante no evento: chave de idempotência para o serviço de certificados
                eventId: event.id,
                userId,
                participantName: participants.get(userId)?.name ?? null,
                eventName: event.name,
                activities: items,
                totalWorkload: Math.round(items.reduce((sum, a) => sum + (a.workload ?? 0), 0) * 10) / 10,
            };
        });
    }
}

// Carga horária = duração da atividade, em horas (1 casa). Sem horário na programação → null.
const workloadHours = ({ startsAt, endsAt }) => {
    if (!startsAt || !endsAt) return null;
    return Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 360_000) / 10;
};
