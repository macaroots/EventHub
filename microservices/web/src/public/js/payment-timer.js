const timer = document.getElementById('payment-timer');
const deadline = Date.parse(timer.dataset.expiresAt);
let checking = false;
async function update() {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    timer.querySelector('strong').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    if (!remaining) {
        timer.firstChild.textContent = 'Prazo encerrado. Atualizando situação: ';
        timer.parentElement.querySelectorAll('[data-payment-action]').forEach(button => { button.disabled = true; });
    }
    if (checking) return;
    checking = true;
    try {
        const response = await fetch(timer.dataset.statusUrl, { cache: 'no-store' });
        if (response.ok) {
            const result = await response.json();
            if (result.status !== 'pending' || result.registrationStatus !== 'awaiting_payment') location.reload();
        }
    } catch {} finally { checking = false; }
}
update();
setInterval(update, 1000);
