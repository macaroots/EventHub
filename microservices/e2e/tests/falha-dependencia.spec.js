import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test, expect, newUser, register, logout, createPublishedEvent, subscribe, pay } from './fixtures.js';

// Falha de dependência: o serviço de pagamento cai durante a inscrição.
// Esperado: a inscrição continua funcionando (comunicação assíncrona via RabbitMQ),
// a tela de pagamento falha de forma controlada e, quando o payment volta,
// consome o PaymentRequested que ficou na fila durável e a compra é concluída.
// Requer o docker compose do projeto rodando localmente (controla o contêiner).
const composeDir = fileURLToPath(new URL('../..', import.meta.url));
const compose = (args) => execSync(`docker compose ${args}`, { cwd: composeDir, stdio: 'pipe' });

test('pagamento indisponível não impede a inscrição e a cobrança é entregue quando volta', async ({ page }) => {
    const organizer = newUser('org');
    const participant = newUser('par');
    const eventName = `Evento ${organizer.username}`;

    await register(page, organizer);
    await createPublishedEvent(page, eventName);
    await logout(page);
    await register(page, participant);

    let paymentUrl;
    try {
        await test.step('derruba o serviço de pagamento', async () => {
            compose('stop -t 2 payment');
        });

        await test.step('participante se inscreve com o payment fora do ar', async () => {
            await subscribe(page, eventName);
            await expect(page.getByRole('link', { name: /Continuar compra/ })).toBeVisible();
        });

        await test.step('tela de pagamento falha de forma controlada', async () => {
            await page.getByRole('link', { name: /Continuar compra/ }).click();
            paymentUrl = page.url();
            await expect(page.getByRole('heading', { name: 'Não foi possível concluir' })).toBeVisible();
            // O restante do sistema segue no ar.
            await page.goto('/');
            await expect(page.getByRole('link', { name: eventName })).toBeVisible();
        });
    } finally {
        compose('start payment');
    }

    await test.step('payment volta, consome a fila e a compra é concluída', async () => {
        await expect(async () => {
            await page.goto(paymentUrl);
            await expect(page.getByRole('button', { name: 'Simular compra', exact: true })).toBeVisible({ timeout: 2000 });
        }).toPass({ timeout: 60_000 });
        await pay(page);
    });
});
