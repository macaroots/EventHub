export const isAdmin = (user) => user.role == 'admin';

// Organizador do evento da atividade (projeção local, ADR 011) ou admin.
export function canManage(activityRepository, eventRepository, activityId, user) {
    if (isAdmin(user)) return true;
    const activity = activityRepository.getHeader(activityId);
    const event = activity && eventRepository.getById(activity.eventId);
    return !!event?.organizers.includes(user.id);
}
