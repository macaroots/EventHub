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
    return { name: `${prefix} ${id}`, username: id, email: `${id}@ex.com`, password: '12345678' };
};

export async function register(page, user) {
    await page.goto('/auth/register');
    await page.getByLabel('Name', { exact: true }).fill(user.name);
    await page.getByLabel('Username', { exact: true }).fill(user.username);
    await page.getByLabel('E-mail').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(user.password);
    await page.getByLabel('Confirm password').fill(user.password);
    await page.getByRole('button', { name: 'Cadastrar' }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
}

export async function login(page, user) {
    await page.goto('/auth/login');
    await page.getByLabel('Username ou e-mail').fill(user.username);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByRole('button', { name: /sair/ })).toBeVisible();
}

export async function logout(page) {
    await page.getByRole('button', { name: /sair/ }).click();
    await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
}
