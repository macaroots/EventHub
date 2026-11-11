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
