// Acompanha o status da inscrição (ADR 009). Hoje: polling de /registrations/:id/status.json.
// Para push, troca-se só este arquivo (EventSource com o mesmo payload {status, waitlistPosition, next}).
export function watchRegistration(id, onUpdate, { interval = 4000 } = {}) {
    let timer;
    const tick = async () => {
        try {
            const response = await fetch(`/registrations/${encodeURIComponent(id)}/status.json`, { headers: { accept: 'application/json' } });
            if (!response.ok || !response.headers.get('content-type')?.includes('json')) return location.reload(); // sessão expirou, erro
            const update = await response.json();
            onUpdate(update);
            if (update.next) return;
        } catch { /* rede: tenta de novo */ }
        timer = setTimeout(tick, interval);
    };
    timer = setTimeout(tick, interval);
    return () => clearTimeout(timer);
}
