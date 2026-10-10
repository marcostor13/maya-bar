import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const API = 'http://localhost:3100';

/** El superadmin que siembra el backend e2e (ver backend/test/support/e2e-env.js). */
export const ADMIN = { email: 'admin@e2e.test', password: 'SuperSecreta!42' };

export interface Account {
  email: string;
  password: string;
  company: string;
}

let seq = 0;

export function newAccount(): Account {
  const id = `${Date.now()}-${++seq}`;
  return {
    email: `owner-${id}@e2e.test`,
    password: 'Clave-Segura-123',
    company: `Empresa ${id}`,
  };
}

/** Da de alta una empresa por la API, sin pasar por la interfaz. */
export async function registerByApi(request: APIRequestContext): Promise<Account> {
  const account = newAccount();
  const res = await request.post(`${API}/auth/register`, {
    data: {
      name: account.company,
      email: account.email,
      ownerName: 'Dueña de Prueba',
      ownerPassword: account.password,
    },
  });
  expect(res.status()).toBe(201);
  return account;
}

export async function loginByUi(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByPlaceholder('tu@email.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

/**
 * Vigila la página y devuelve lo que salió mal: excepciones de JavaScript y
 * respuestas 5xx de la API. Una pantalla puede pintarse "bien" con un panel
 * vacío porque su petición falló; esto lo saca a la luz.
 */
export function watchForFailures(page: Page): string[] {
  const failures: string[] = [];
  page.on('pageerror', (err) => failures.push(`pageerror: ${err.message}`));
  page.on('response', (res) => {
    if (res.url().startsWith(API) && res.status() >= 500)
      failures.push(`${res.status()} ${res.request().method()} ${res.url()}`);
  });
  return failures;
}
