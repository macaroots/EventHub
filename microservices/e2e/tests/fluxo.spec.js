import { test, expect, newUser, register, login, logout, createPublishedEvent, subscribe, pay } from './fixtures.js';

// Fluxo completo: organizador cria e publica um evento pago; participante se inscreve e paga.
test('organizador publica evento e participante se inscreve e paga', async ({ page }) => {
    const organizer = newUser('org');
    const participant = newUser('par');
    const eventName = `Evento ${organizer.username}`;

    await test.step('organizador: cadastro, saída e login', async () => {
        await register(page, organizer);
        await logout(page);
        await login(page, organizer);
    });

    await createPublishedEvent(page, eventName);
    await logout(page);

    await test.step('participante: cadastro (já entra logado)', async () => {
        await register(page, participant);
    });

    await test.step('participante: se inscreve', async () => {
        await subscribe(page, eventName);
    });

    await test.step('participante: paga', async () => {
        // A cobrança é criada por mensagem: recarrega até aparecer o link de compra.
        await expect(async () => {
            await page.reload();
            await expect(page.getByRole('link', { name: /Continuar compra/ })).toBeVisible({ timeout: 1000 });
        }).toPass({ timeout: 15_000 });
        await page.getByRole('link', { name: /Continuar compra/ }).click();
        await expect(page.getByRole('heading', { name: 'Pagamento da inscrição' })).toBeVisible();
        await pay(page);
    });
});
