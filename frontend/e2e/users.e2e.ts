import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { API, loginByUi, registerByApi, watchForFailures, type Account } from './support';

async function tokenFor(request: APIRequestContext, email: string, password: string): Promise<string> {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { access_token: string }).access_token;
}

// El driver de Mongo vive en el backend; la URI apunta a la base en memoria del backend e2e.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MongoClient, ObjectId } = require(resolve(__dirname, '../../backend/node_modules/mongodb')) as typeof import('mongodb');

async function withDb<T>(fn: (db: import('mongodb').Db) => Promise<T>): Promise<T> {
  const uri = readFileSync(join(tmpdir(), 'maya-e2e-mongo-uri'), 'utf8').trim();
  expect(uri).toMatch(/^mongodb:\/\/(127\.0\.0\.1|localhost)/);
  const client = await MongoClient.connect(uri);
  try {
    return await fn(client.db());
  } finally {
    await client.close();
  }
}

/** En e2e no hay correo: el código de recuperación se lee de la Mongo en memoria. */
async function resetCodeOf(email: string): Promise<string> {
  return withDb(async (db) => {
    const user = await db.collection('users').findOne({ email });
    expect(user?.resetPasswordCode).toMatch(/^\d{6}$/);
    return user!.resetPasswordCode as string;
  });
}
test.describe('Usuarios: recuperar, restablecer y eliminar', () => {
  let account: Account;

  test.beforeEach(async ({ request }) => {
    account = await registerByApi(request);
  });

  test('"¿Olvidaste tu contraseña?" desde el login cambia la clave y corta la sesión anterior', async ({ page, request }) => {
    const failures = watchForFailures(page);
    const oldToken = await tokenFor(request, account.email, account.password);
    const auth = { Authorization: `Bearer ${oldToken}` };
    expect((await request.get(`${API}/users`, { headers: auth })).status()).toBe(200);

    await page.goto('/login');
    await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click();
    await page.getByPlaceholder('tu@email.com').fill(account.email);
    await page.getByRole('button', { name: 'Enviar código' }).click();
    await expect(page.getByText('Se ha enviado un código de 6 dígitos')).toBeVisible();

    const code = await resetCodeOf(account.email);
    const nueva = 'Otra-Clave-456';
    await page.getByPlaceholder('123456').fill(code);
    await page.getByPlaceholder('••••••••').fill(nueva);
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click();

    // Vuelve al login con el correo ya puesto y entra con la clave nueva.
    await expect(page.getByRole('button', { name: 'Ingresar' })).toBeVisible();
    await expect(page.getByPlaceholder('tu@email.com')).toHaveValue(account.email);
    await page.getByPlaceholder('••••••••').fill(nueva);
    await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/\/dashboard/);

    expect((await request.get(`${API}/users`, { headers: auth })).status()).toBe(401);
    expect((await request.post(`${API}/auth/login`, { data: { email: account.email, password: account.password } })).status()).toBe(401);
    expect(failures).toEqual([]);
  });

  test('el administrador restablece con contraseña temporal desde Usuarios', async ({ page, request }) => {
    const failures = watchForFailures(page);
    const adminToken = await tokenFor(request, account.email, account.password);
    const email = `vendedor-${Date.now()}@e2e.test`;
    const created = await request.post(`${API}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { name: 'Vendedor Prueba', email, role: 'MANAGER' },
    });
    expect(created.status()).toBe(201);
    const { tempPassword: first } = (await created.json()) as { tempPassword: string };
    const staffToken = await tokenFor(request, email, first);
    const staffAuth = { Authorization: `Bearer ${staffToken}` };
    expect((await request.get(`${API}/me/permissions`, { headers: staffAuth })).status()).toBe(200);

    await loginByUi(page, account.email, account.password);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/users');
    const row = page.locator('tbody tr', { hasText: email });
    await expect(row.getByText('Nunca')).toHaveCount(0); // ya entró por la API: tiene último acceso
    await row.getByRole('button', { name: /Restablecer acceso de/ }).click();

    const dialog = page.getByRole('dialog', { name: 'Restablecer acceso' });
    await dialog.getByText('Generar una contraseña temporal').click();
    await dialog.getByRole('button', { name: 'Restablecer acceso' }).click();
    const pass = (await page.locator('.ud-pass').textContent())!.trim();
    expect(pass).toMatch(/^Tmp@/);
    expect(pass).not.toBe(first);
    await page.getByRole('button', { name: 'Entendido' }).click();
    await expect(page.locator('.ud-pass')).toHaveCount(0);

    // La sesión vieja muere, la clave vieja ya no vale y la nueva sí.
    expect((await request.get(`${API}/me/permissions`, { headers: staffAuth })).status()).toBe(401);
    expect((await request.post(`${API}/auth/login`, { data: { email, password: first } })).status()).toBe(401);
    await tokenFor(request, email, pass);

    // Queda en el registro.
    await page.getByRole('button', { name: 'Registro' }).click();
    await expect(page.locator('app-user-audit tbody tr', { hasText: 'Acceso restablecido' })).toBeVisible();
    expect(failures).toEqual([]);
  });

  test('busca a un usuario y lo elimina reasignando su contenido', async ({ page, request }) => {
    const failures = watchForFailures(page);
    const adminToken = await tokenFor(request, account.email, account.password);
    const headers = { Authorization: `Bearer ${adminToken}` };
    const email = `saliente-${Date.now()}@e2e.test`;
    const created = await request.post(`${API}/users`, { headers, data: { name: 'Persona Saliente', email, role: 'MANAGER' } });
    expect(created.status()).toBe(201);
    const { user } = (await created.json()) as { user: { _id: string; tenantId: string } };
    const owner = ((await (await request.get(`${API}/users`, { headers })).json()) as { _id: string; email: string }[])
      .find((u) => u.email === account.email)!;

    // Un contacto creado por la persona que se va.
    const customerId = await withDb(async (db) =>
      (await db.collection('customers').insertOne({
        tenantId: new ObjectId(user.tenantId), name: 'Cliente heredado', createdBy: new ObjectId(user._id),
        createdAt: new Date(), updatedAt: new Date(),
      })).insertedId,
    );

    await loginByUi(page, account.email, account.password);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/users');
    await page.getByLabel('Buscar usuarios').fill('saliente');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    const row = page.locator('tbody tr', { hasText: email });
    await row.getByRole('button', { name: 'Eliminar', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: /Eliminar a Persona Saliente/ });
    await expect(dialog.getByText('Contactos')).toBeVisible();
    await dialog.getByLabel('Destino del contenido').selectOption(owner._id);
    await dialog.getByRole('button', { name: 'Eliminar definitivamente' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('tbody tr', { hasText: email })).toHaveCount(0);

    await withDb(async (db) => {
      expect(await db.collection('users').findOne({ email })).toBeNull();
      const customer = await db.collection('customers').findOne({ _id: customerId });
      expect(String(customer?.createdBy)).toBe(owner._id);
    });
    expect(failures).toEqual([]);
  });
});
