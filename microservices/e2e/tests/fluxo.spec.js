import { test, expect, newUser, register, login, logout } from './fixtures.js';

// Fluxo completo: organizador cria e publica um evento pago; participante se inscreve e paga.
test('organizador publica evento e participante se inscreve e paga', async ({ page }) => {
    const organizer = newUser('org');
    const participant = newUser('par');
    const eventName = `Evento ${organizer.username}`;

    await test.step('organizador: cadastro e login', async () => {
        await register(page, organizer);
        await login(page, organizer);
    });

    await test.step('organizador: cria o evento', async () => {
        await page.goto('/organizers/events');
        await page.getByLabel('Nome:').fill(eventName);
        await page.getByLabel('Informações:').fill('Criado pelo teste e2e');
        await page.getByLabel('Início:').fill('2030-01-10');
        await page.getByLabel('Fim:').fill('2030-01-12');
        await page.getByRole('button', { name: 'Criar' }).click();
        await expect(page.getByRole('heading', { name: eventName })).toBeVisible();
    });

    await test.step('organizador: cria uma atividade paga', async () => {
        await page.getByRole('link', { name: '+ Nova atividade' }).click();
        await page.getByLabel('Nome:').fill('Oficina');
        await page.getByLabel('Descrição:').fill('Atividade do teste');
        await page.getByLabel('Local:').fill('Sala 1');
        await page.getByLabel('Início:').fill('2030-01-10T09:00');
        await page.getByLabel('Fim:').fill('2030-01-10T12:00');
        await page.getByLabel('Vagas:').fill('10');
        await page.getByLabel('Preço:').fill('25');
        await page.getByRole('button', { name: 'Criar' }).click();
        await expect(page.getByRole('link', { name: 'Oficina' })).toBeVisible();
    });

    await test.step('organizador: publica', async () => {
        await page.getByRole('button', { name: 'Publicar' }).click();
        await expect(page.getByRole('heading', { name: eventName })).toContainText('published');
        await logout(page);
    });

    await test.step('participante: cadastro e login', async () => {
        await register(page, participant);
        await login(page, participant);
    });

    await test.step('participante: se inscreve', async () => {
        await page.goto('/');
        await page.getByRole('link', { name: eventName }).click();
        // Logo após o cadastro, o registration pode ainda não conhecer o usuário (UserRegistered assíncrono).
        await expect(async () => {
            await page.getByRole('button', { name: 'Inscrever-se' }).click();
            await expect(page).toHaveURL(/\/registrations\/[^/]+$/, { timeout: 1000 });
        }).toPass({ timeout: 15_000 });
    });

    await test.step('participante: paga', async () => {
        // A cobrança é criada por mensagem: recarrega até aparecer o link de pagamento.
        await expect(async () => {
            await page.reload();
            await expect(page.getByRole('link', { name: /Pagar R\$/ })).toBeVisible({ timeout: 1000 });
        }).toPass({ timeout: 15_000 });
        await page.getByRole('link', { name: /Pagar R\$/ }).click();
        await page.getByLabel('Comprovante:').fill('comprovante-123');
        await page.getByRole('button', { name: 'Pagar' }).click();
        await expect(page).toHaveURL(/\/registrations\/[^/]+$/);
        await expect(async () => {
            await page.reload();
            await expect(page.getByText('Inscrição confirmada!')).toBeVisible({ timeout: 1000 });
        }).toPass({ timeout: 15_000 });
    });
});
