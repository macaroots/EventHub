import { test, expect, newUser, register, login, logout } from './fixtures.js';

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

    await test.step('organizador: cria o evento', async () => {
        await page.goto('/organizers/events');
        await page.getByLabel('Nome do evento').fill(eventName);
        await page.getByLabel('Informações / Descrição').fill('Criado pelo teste e2e');
        await page.getByLabel('Local do evento').fill('Auditório');
        await page.getByLabel('Data de início').fill('2030-01-10');
        await page.getByLabel('Data de término').fill('2030-01-12');
        await page.getByRole('button', { name: 'Criar evento' }).click();
        await expect(page.getByRole('heading', { level: 1, name: eventName })).toBeVisible();
    });

    await test.step('organizador: cria uma atividade paga', async () => {
        await page.getByRole('tab', { name: /Atividades/ }).click();
        await page.getByRole('link', { name: 'Adicionar atividade' }).first().click();
        await page.getByLabel('Nome', { exact: true }).fill('Oficina');
        await page.getByLabel('Descrição', { exact: true }).fill('Atividade do teste');
        await page.getByLabel('Local', { exact: true }).fill('Sala 1');
        await page.getByLabel('Início', { exact: true }).fill('2030-01-10T09:00');
        await page.getByLabel('Fim', { exact: true }).fill('2030-01-10T12:00');
        await page.getByLabel('Vagas', { exact: true }).fill('10');
        await page.getByLabel('Preço', { exact: true }).fill('25');
        await page.getByRole('button', { name: 'Criar atividade' }).click();
        // Volta para o evento já na aba de atividades.
        await expect(page.getByRole('link', { name: 'Oficina' })).toBeVisible();
    });

    await test.step('organizador: publica', async () => {
        await page.getByRole('tab', { name: /Informações do evento/ }).click();
        await page.getByRole('button', { name: 'Publicar evento' }).click();
        await expect(page.getByText('Evento publicado com sucesso.')).toBeVisible();
        await expect(page.locator('.event-title-row .status-pill')).toHaveText('Publicado');
        await logout(page);
    });

    await test.step('participante: cadastro (já entra logado)', async () => {
        await register(page, participant);
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
        // A cobrança é criada por mensagem: recarrega até aparecer o link de compra.
        await expect(async () => {
            await page.reload();
            await expect(page.getByRole('link', { name: /Continuar compra/ })).toBeVisible({ timeout: 1000 });
        }).toPass({ timeout: 15_000 });
        await page.getByRole('link', { name: /Continuar compra/ }).click();
        await expect(page.getByRole('heading', { name: 'Pagamento da inscrição' })).toBeVisible();
        await page.getByRole('button', { name: 'Simular compra', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Pagamento aprovado' })).toBeVisible();
        await page.getByRole('link', { name: 'Ver inscrição' }).click();
        await expect(page).toHaveURL(/\/registrations\/[^/]+$/);
        await expect(async () => {
            await page.reload();
            await expect(page.getByText('Inscrição confirmada!')).toBeVisible({ timeout: 1000 });
        }).toPass({ timeout: 15_000 });
    });
});
