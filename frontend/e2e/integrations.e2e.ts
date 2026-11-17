import { test, expect, type APIRequestContext } from '@playwright/test';
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { API, loginByUi, registerByApi, watchForFailures, type Account } from './support';

/** Mismo secreto falso con el que el backend e2e verifica la firma de Meta. */
const APP_SECRET = 'e2e-app-secret';

async function seedWhatsAppAccount(request: APIRequestContext, account: Account, phoneNumberId: string) {
  const login = await request.post(`${API}/auth/login`, {
    data: { email: account.email, password: account.password },
  });
  const { user } = (await login.json()) as { user: { tenantId: string } };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MongoClient, ObjectId } = require(resolve(__dirname, '../../backend/node_modules/mongodb')) as typeof import('mongodb');
  const uri = readFileSync(join(tmpdir(), 'maya-e2e-mongo-uri'), 'utf8').trim();
  expect(uri).toMatch(/^mongodb:\/\/(127\.0\.0\.1|localhost)/);
  const client = await MongoClient.connect(uri);
  try {
    await client.db().collection('whatsappaccounts').insertOne({
      tenantId: new ObjectId(user.tenantId),
      label: 'Línea web',
      provider: 'cloudapi',
      phoneNumber: '+51 100 000 001',
      waPhoneNumberId: phoneNumberId,
      waAccessToken: 'token-falso',
      active: true,
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } finally {
    await client.close();
  }
}

/** Un mensaje entrante firmado, como lo manda Meta: abre la ventana de 24 h. */
async function inbound(request: APIRequestContext, phoneNumberId: string, from: string, name: string) {
  const raw = JSON.stringify({
    entry: [{
      changes: [{
        field: 'messages',
        value: {
          metadata: { phone_number_id: phoneNumberId },
          contacts: [{ wa_id: from, profile: { name } }],
          messages: [{
            from, id: `wamid.in-${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)),
            type: 'text', text: { body: 'Hola, quiero saber de mi pedido' },
          }],
        },
      }],
    }],
  });
  const signature = 'sha256=' + createHmac('sha256', APP_SECRET).update(raw).digest('hex');
  const res = await request.post(`${API}/wa/webhook/cloud`, {
    headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature },
    data: raw,
  });
  expect(res.status()).toBe(200);
}

test.describe('Integraciones: API de envío (HU13)', () => {
  test('crear un acceso, enviar con la clave, verlo en la bandeja y revocar', async ({ page, request }) => {
    const account = await registerByApi(request);
    const stamp = Date.now();
    const phoneNumberId = `PNID-API-${stamp}`;
    const from = `5198822${String(stamp).slice(-4)}`;
    const NAME = `Cliente API ${stamp}`;
    await seedWhatsAppAccount(request, account, phoneNumberId);
    await inbound(request, phoneNumberId, from, NAME);

    const failures = watchForFailures(page);
    await loginByUi(page, account.email, account.password);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/integraciones');
    await expect(page.getByRole('heading', { name: 'Integraciones' })).toBeVisible();
    await expect(page.getByText('Todavía no has creado ningún acceso')).toBeVisible();

    await page.getByRole('button', { name: 'Nuevo acceso' }).click();
    const form = page.getByRole('dialog', { name: 'Nuevo acceso' });
    await form.getByLabel('Nombre').fill('Web e2e');
    await expect(form.getByLabel('Cuenta que compartes')).toHaveValue(/^whatsapp:/);
    await form.getByLabel('Dominios autorizados').fill('mitienda.pe');
    await form.getByRole('button', { name: 'Crear acceso' }).click();

    const keyDialog = page.getByRole('dialog', { name: 'Guarda tu clave' });
    await expect(keyDialog).toBeVisible();
    const key = (await keyDialog.locator('.key-value').textContent())!.trim();
    expect(key).toMatch(/^mk_/);
    await keyDialog.getByRole('button', { name: 'Ya la guardé' }).click();
    await expect(keyDialog).toHaveCount(0);
    const card = page.locator('.access', { hasText: 'Web e2e' });
    await expect(card).toContainText('Activo');
    await expect(card).not.toContainText(key);

    // El sistema del cliente envía con la clave desde su dominio.
    const sent = await request.post(`${API}/public/v1/messages`, {
      headers: { Authorization: `Bearer ${key}`, Origin: 'https://www.mitienda.pe' },
      data: { to: `+${from}`, text: 'Tu pedido ya salió' },
    });
    expect(sent.status()).toBe(201);
    expect(((await sent.json()) as { status: string }).status).toBe('sent');

    await page.goto('/inbox');
    await page.locator('.chat-item', { hasText: NAME }).click();
    const bubble = page.locator('.bubble', { hasText: 'Tu pedido ya salió' });
    await expect(bubble).toContainText('API · Web e2e');

    await page.goto('/integraciones');
    await page.getByRole('button', { name: 'Revocar Web e2e' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.locator('.toast-message', { hasText: 'Acceso revocado' })).toBeVisible();
    await expect(page.locator('.access', { hasText: 'Web e2e' })).toContainText('Revocado');

    const after = await request.post(`${API}/public/v1/messages`, {
      headers: { Authorization: `Bearer ${key}`, Origin: 'https://www.mitienda.pe' },
      data: { to: `+${from}`, text: 'otra vez' },
    });
    expect(after.status()).toBe(401);
    expect(failures).toEqual([]);
  });
});
