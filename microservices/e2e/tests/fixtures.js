import { test as base, expect } from '@playwright/test';

// Mostra um círculo onde cada clique acontece, para acompanhar no navegador e no vídeo/trace.
const showClicks = () => {
    addEventListener('mousedown', (e) => {
        const dot = document.createElement('div');
        dot.style.cssText = `position:fixed;left:${e.clientX - 15}px;top:${e.clientY - 15}px;width:30px;height:30px;
            border-radius:50%;background:rgba(255,0,0,.4);border:2px solid red;pointer-events:none;z-index:99999;
            transition:transform .6s,opacity .6s`;
        document.body.appendChild(dot);
        requestAnimationFrame(() => { dot.style.transform = 'scale(2)'; dot.style.opacity = '0'; });
        setTimeout(() => dot.remove(), 700);
    }, true);
};

export const test = base.extend({
    page: async ({ page }, use) => {
        await page.addInitScript(showClicks);
        await use(page);
    },
});
export { expect };

export const newUser = (prefix) => {
    const id = `${prefix}${Date.now().toString(36)}`;
    return { username: id, email: `${id}@ex.com`, password: '12345678' };
};

// Cadastro faz login automático e leva a /organizers/events.
export async function register(page, user) {
    await page.goto('/auth/register');
    await page.getByLabel('E-mail').fill(user.email);
    await page.getByLabel('Username').fill(user.username);
    await page.getByLabel('Senha').fill(user.password);
    await page.getByRole('button', { name: 'Criar conta' }).click();
    await expect(page.getByTitle('Sair')).toBeVisible();
}

export async function login(page, user) {
    await page.goto('/auth/login');
    await page.getByLabel('E-mail').fill(user.email);
    await page.getByLabel('Senha').fill(user.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByTitle('Sair')).toBeVisible();
}

// O botão de sair é só um ícone (➔) com title="Sair".
export async function logout(page) {
    await page.getByTitle('Sair').click();
    await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible();
}

// Organizador (já logado) cria um evento com uma atividade paga e o publica.
export async function createPublishedEvent(page, eventName) {
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
    });
}

// Participante (já logado) se inscreve na atividade do evento e cai na página da inscrição.
export async function subscribe(page, eventName) {
    await page.goto('/');
    await page.getByRole('link', { name: eventName }).click();
    // Logo após o cadastro, o registration pode ainda não conhecer o usuário (UserRegistered assíncrono).
    await expect(async () => {
        await page.getByRole('button', { name: 'Inscrever-se' }).click();
        await expect(page).toHaveURL(/\/registrations\/[^/]+$/, { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
}

// Na página da cobrança: simula a compra e confere a inscrição confirmada.
export async function pay(page) {
    await page.getByRole('button', { name: 'Simular compra', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Pagamento aprovado' })).toBeVisible();
    await page.getByRole('link', { name: 'Ver inscrição' }).click();
    await expect(page).toHaveURL(/\/registrations\/[^/]+$/);
    await expect(async () => {
        await page.reload();
        await expect(page.getByText('Inscrição confirmada!')).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
}
