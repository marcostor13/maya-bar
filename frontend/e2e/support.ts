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

/**
 * Da de alta una empresa como lo hace el superadmin (no hay registro público
 * desde HU87). Devuelve la contraseña temporal; con `keepTemporary: false`
 * (por defecto) la cambia por la de `account` para entrar directo al CRM.
 */
export async function registerByApi(
  request: APIRequestContext,
  opts: { keepTemporary?: boolean; paidPlan?: boolean } = {},
): Promise<Account & { temporary: string }> {
  const account = newAccount();
  const token = async (email: string, password: string) => {
    const res = await request.post(`${API}/auth/login`, { data: { email, password } });
    expect(res.status()).toBeLessThan(300);
    return ((await res.json()) as { access_token: string }).access_token;
  };
  const admin = await token(ADMIN.email, ADMIN.password);
  const created = await request.post(`${API}/tenants`, {
    headers: { Authorization: `Bearer ${admin}` },
    data: { name: account.company, email: account.email, ownerName: 'Dueña de Prueba' },
  });
  expect(created.status()).toBe(201);
  const body = (await created.json()) as { tenant: { _id: string }; credentials: { password: string } };
  const temporary = body.credentials.password;
  // Un cliente real nace al pagar: el superadmin registra el pago y el plan queda activo.
  if (opts.paidPlan) {
    const paid = await request.post(`${API}/billing/admin/subscriptions/${body.tenant._id}/manual-payment`, {
      headers: { Authorization: `Bearer ${admin}` },
      data: { plan: 'crece', period: 'monthly', currency: 'PEN', total: 293.82, method: 'transfer', reference: 'E2E' },
    });
    expect(paid.status()).toBe(201);
  }
  if (opts.keepTemporary) return { ...account, temporary };
  const owner = await token(account.email, temporary);
  const changed = await request.patch(`${API}/auth/change-password`, {
    headers: { Authorization: `Bearer ${owner}` },
    data: { currentPassword: temporary, newPassword: account.password },
  });
  expect(changed.status()).toBeLessThan(300);
  return { ...account, temporary };
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
