import { defineConfig, devices } from '@playwright/test';

// SLOWMO (ms) atrasa cada ação para dar tempo de acompanhar no navegador.
const slowMo = Number(process.env.SLOWMO ?? 400);

export default defineConfig({
    testDir: 'tests',
    timeout: 120_000,
    workers: 1,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
        launchOptions: { slowMo },
        trace: 'on',
        video: 'retain-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
