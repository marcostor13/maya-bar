import { test, expect, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { API, loginByUi, registerByApi, watchForFailures, type Account } from './support';

/**
 * Los chats entran por los webhooks de WhatsApp/Instagram, que en e2e no
 * existen: se siembran directamente en la Mongo en memoria del backend e2e
 * (que deja su URI en un archivo temporal al arrancar).
 */
async function seedConversations(
  request: APIRequestContext,
  account: Account,
  convs: { contact: string; contactName: string; preview: string }[],
) {
  const login = await request.post(`${API}/auth/login`, {
    data: { email: account.email, password: account.password },
  });
  expect(login.status()).toBe(201);
  const { user } = (await login.json()) as { user: { tenantId: string } };

  // El driver de Mongo vive en el backend; la URI solo apunta a la base en memoria.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MongoClient, ObjectId } = require(resolve(__dirname, '../../backend/node_modules/mongodb')) as typeof import('mongodb');
  const uri = readFileSync(join(tmpdir(), 'maya-e2e-mongo-uri'), 'utf8').trim();
  expect(uri).toMatch(/^mongodb:\/\/(127\.0\.0\.1|localhost)/);
  const client = await MongoClient.connect(uri);
  try {
    const now = Date.now();
    await client.db().collection('conversations').insertMany(
      convs.map((c, i) => ({
        tenantId: new ObjectId(user.tenantId),
        channel: 'instagram',
        accountId: new ObjectId(),
        contact: c.contact,
        contactName: c.contactName,
        lastMessagePreview: c.preview,
        lastMessageDirection: 'in',
        lastMessageAt: new Date(now - i * 60_000),
        unreadCount: 0,
        autoReply: true,
        status: 'open',
        escalated: false,
        escalationNotifiedTo: [],
        blocked: false,
        inTrash: false,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })),
    );
  } finally {
    await client.close();
  }
}

test.describe('Bandeja: papelera y bloqueos', () => {
  let account: Account;
  const stamp = Date.now();
  const SPAM = `Spam ${stamp}`;
  const CLIENTE = `Cliente ${stamp}`;
  const PROMO = `Promo ${stamp}`;

  test.beforeAll(async ({ request }) => {
    account = await registerByApi(request);
    await seedConversations(request, account, [
      { contact: `ig-spam-${stamp}`, contactName: SPAM, preview: 'Gana dinero ya' },
      { contact: `ig-cli-${stamp}`, contactName: CLIENTE, preview: 'Hola, quiero info' },
      { contact: `ig-promo-${stamp}`, contactName: PROMO, preview: 'Oferta' },
    ]);
  });

  test.beforeEach(async ({ page }) => {
    await loginByUi(page, account.email, account.password);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('eliminar varias a la papelera y restaurar', async ({ page }) => {
    const failures = watchForFailures(page);
    await page.goto('/inbox');
    const spamItem = page.locator('.chat-item', { hasText: SPAM });
    const promoItem = page.locator('.chat-item', { hasText: PROMO });
    const clienteItem = page.locator('.chat-item', { hasText: CLIENTE });
    await expect(spamItem).toBeVisible();

    await page.getByRole('button', { name: 'Más opciones de la bandeja' }).click();
    await page.getByRole('menuitem', { name: 'Seleccionar' }).click();
    await spamItem.click();
    await expect(page.getByText('1 seleccionada')).toBeVisible();
    await promoItem.click();
    await expect(page.getByText('2 seleccionadas')).toBeVisible();

    await page.getByRole('toolbar').getByRole('button', { name: 'Eliminar', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.locator('.toast-message', { hasText: '2 conversaciones movidas' })).toBeVisible();
    await expect(spamItem).toHaveCount(0);
    await expect(promoItem).toHaveCount(0);
    await expect(clienteItem).toBeVisible();

    await page.getByRole('button', { name: 'Más opciones de la bandeja' }).click();
    await page.getByRole('menuitem', { name: 'Papelera' }).click();
    const trash = page.getByRole('dialog', { name: 'Papelera' });
    await expect(trash.getByText(SPAM)).toBeVisible();
    await expect(trash.getByText(PROMO)).toBeVisible();
    await trash.getByRole('button', { name: 'Restaurar' }).first().click();
    await expect(page.locator('.toast-message', { hasText: 'Conversación restaurada' })).toBeVisible();
    await trash.getByRole('button', { name: 'Restaurar' }).first().click();
    await expect(page.locator('.toast-message', { hasText: 'Conversación restaurada' })).toBeVisible();
    await expect(trash.getByText('La papelera está vacía')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(spamItem).toBeVisible();
    await expect(promoItem).toBeVisible();

    // Siguen en la bandeja tras recargar: se restauraron en el servidor.
    await page.reload();
    await expect(spamItem).toBeVisible();
    await expect(promoItem).toBeVisible();
    expect(failures).toEqual([]);
  });

  test('bloquear un contacto y desbloquearlo desde la lista de bloqueados', async ({ page }) => {
    const failures = watchForFailures(page);
    await page.goto('/inbox');
    const item = page.locator('.chat-item', { hasText: CLIENTE });
    await item.click();

    await page.locator('.thread').getByRole('button', { name: 'Bloquear contacto' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Bloquear contacto' });
    await dialog.getByPlaceholder('Spam, acoso, número equivocado…').fill('Prueba e2e');
    await dialog.getByRole('button', { name: 'Bloquear', exact: true }).click();
    await expect(page.locator('.toast-message', { hasText: 'Contacto bloqueado' })).toBeVisible();
    await expect(item.getByText('Bloqueado')).toBeVisible();

    await page.getByRole('button', { name: 'Más opciones de la bandeja' }).click();
    await page.getByRole('menuitem', { name: 'Contactos bloqueados' }).click();
    const panel = page.getByRole('dialog', { name: 'Contactos bloqueados' });
    await expect(panel.getByText('Prueba e2e')).toBeVisible();
    await panel.getByRole('button', { name: `Desbloquear ig-cli-${stamp}` }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.locator('.toast-message', { hasText: 'Contacto desbloqueado' })).toBeVisible();
    await expect(panel.getByText('No hay contactos bloqueados')).toBeVisible();
    await page.keyboard.press('Escape');

    // El chat se desmarca por tiempo real (o al recargar si el socket tarda).
    await page.reload();
    await expect(page.locator('.chat-item', { hasText: CLIENTE }).getByText('Bloqueado')).toHaveCount(0);
    expect(failures).toEqual([]);
  });
});
