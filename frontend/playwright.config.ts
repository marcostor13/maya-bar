import { defineConfig, devices } from '@playwright/test';

const API_PORT = 3100;
const WEB_PORT = 4300;

/**
 * Pruebas de navegador contra la plataforma completa: frontend real + backend
 * real sobre una Mongo en memoria (nunca la base de `backend/.env`).
 *
 *   npm run e2e          # desde frontend/
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  // Las pruebas comparten un backend y crean sus propios datos: en serie.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run build && npm run e2e:server',
      cwd: '../backend',
      url: `http://127.0.0.1:${API_PORT}/`,
      timeout: 240_000,
      reuseExistingServer: false,
      env: {
        E2E_API_PORT: String(API_PORT),
        E2E_WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: `npx ng serve frontend --configuration e2e --port ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/login`,
      timeout: 300_000,
      reuseExistingServer: false,
    },
  ],
});
