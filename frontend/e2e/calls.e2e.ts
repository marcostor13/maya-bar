import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { createHmac } from 'crypto';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { API, loginByUi, registerByApi, watchForFailures, type Account } from './support';

/** El mismo secreto falso que usa el backend e2e (backend/test/support/e2e-env.js). */
const APP_SECRET = 'e2e-app-secret';
const GRAPH_LOG = join(tmpdir(), 'maya-e2e-graph-calls.log');

/**
 * Micrófono y WebRTC simulados: Chromium sin cámara/micro ni Meta al otro
 * lado. Lo justo para el flujo oferta/respuesta del servicio de llamadas.
 */
async function fakeWebRtc(page: Page) {
  await page.addInitScript(() => {
    const track = { kind: 'audio', enabled: true, stop() { /* nada */ } };
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => stream },
    });
    class FakePeer {
      iceGatheringState = 'complete';
      connectionState = 'new';
      localDescription: { type: string; sdp: string } | null = null;
      ontrack = null;
      onconnectionstatechange = null;
      onicegatheringstatechange = null;
      addTrack() { /* nada */ }
      async setRemoteDescription() { /* nada */ }
      async createAnswer() { return { type: 'answer', sdp: 'v=0 RESPUESTA' }; }
      async createOffer() { return { type: 'offer', sdp: 'v=0 OFERTA' }; }
      async setLocalDescription(d: { type: string; sdp: string }) { this.localDescription = d; }
      close() { /* nada */ }
    }
    (window as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = FakePeer;
  });
}

/** Una cuenta de WhatsApp Cloud API de mentira para la empresa de la prueba. */
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
      label: 'Línea de ventas',
      provider: 'cloudapi',
      phoneNumber: '+51 100 000 000',
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

/** Webhook `calls` firmado, como lo manda Meta. */
async function callWebhook(request: APIRequestContext, phoneNumberId: string, value: Record<string, unknown>) {
  const raw = JSON.stringify({
    entry: [{ changes: [{ field: 'calls', value: { metadata: { phone_number_id: phoneNumberId }, ...value } }] }],
  });
  const signature = 'sha256=' + createHmac('sha256', APP_SECRET).update(raw).digest('hex');
  const res = await request.post(`${API}/wa/webhook/cloud`, {
    headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature },
    data: raw,
  });
  expect(res.status()).toBe(200);
}

const connect = (id: string, from: string, name: string) => ({
  contacts: [{ wa_id: from, profile: { name } }],
  calls: [{
    id, from, to: '51100000000', event: 'connect', direction: 'USER_INITIATED',
    timestamp: String(Math.floor(Date.now() / 1000)),
    session: { sdp_type: 'offer', sdp: 'v=0 OFERTA-DE-META' },
  }],
});

const graphActions = () =>
  readFileSync(GRAPH_LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { kind: string; action?: string; hasSdp: boolean });

test.describe('Llamadas de WhatsApp', () => {
  let account: Account;
  const stamp = Date.now();
  const PNID = `pnid-${stamp}`;
  const ANA = `Ana ${stamp}`;
  const LUIS = `Luis ${stamp}`;

  test.beforeAll(async ({ request }) => {
    account = await registerByApi(request);
    await seedWhatsAppAccount(request, account, PNID);
  });

  test.beforeEach(async ({ page }) => {
    await fakeWebRtc(page);
    await loginByUi(page, account.email, account.password);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('entrante: suena, se atiende, se cuelga y queda en el historial', async ({ page, request }) => {
    const failures = watchForFailures(page);
    await page.getByRole('link', { name: 'Llamadas' }).first().click();
    await expect(page).toHaveURL(/\/llamadas/);
    await expect(page.getByText('Todavía no hay llamadas')).toBeVisible();

    await callWebhook(request, PNID, connect(`wacid.in-${stamp}`, '51987000001', ANA));
    const ring = page.getByRole('alertdialog', { name: ANA });
    await expect(ring).toBeVisible();
    await expect(ring.getByRole('button', { name: 'Aceptar' })).toBeFocused();

    await ring.getByRole('button', { name: 'Aceptar' }).click();
    const panel = page.getByRole('region', { name: 'Llamada en curso' });
    await expect(panel).toContainText('En llamada');
    await expect(panel).toContainText(/00:0\d/);
    await expect(ring).toHaveCount(0);
    const actions = graphActions().filter((a) => a.kind === 'calls').map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['pre_accept', 'accept']));
    expect(graphActions().find((a) => a.action === 'accept')?.hasSdp).toBe(true);

    await panel.getByRole('button', { name: 'Silenciar micrófono' }).click();
    await expect(panel.getByRole('button', { name: 'Activar micrófono' })).toHaveAttribute('aria-pressed', 'true');
    await panel.getByRole('button', { name: 'Colgar' }).click();
    await expect(panel).toHaveCount(0);

    const row = page.locator('tbody tr', { hasText: ANA });
    await expect(row).toContainText('Completada');
    await expect(row.getByRole('button', { name: `Devolver llamada a ${ANA}` })).toBeVisible();
    expect(failures).toEqual([]);
  });

  test('perdida: Meta la termina sin que nadie atienda; filtros del historial', async ({ page, request }) => {
    const failures = watchForFailures(page);
    await page.goto('/llamadas');
    await expect(page.getByRole('heading', { name: 'Llamadas' })).toBeVisible();

    await callWebhook(request, PNID, connect(`wacid.miss-${stamp}`, '51987000002', LUIS));
    await expect(page.getByRole('alertdialog', { name: LUIS })).toBeVisible();
    await callWebhook(request, PNID, { calls: [{ id: `wacid.miss-${stamp}`, event: 'terminate', status: 'FAILED' }] });
    await expect(page.getByRole('alertdialog', { name: LUIS })).toHaveCount(0);
    await expect(page.locator('tbody tr', { hasText: LUIS })).toContainText('Perdida');

    await page.getByLabel('Estado').selectOption('missed');
    await expect(page.locator('tbody tr', { hasText: LUIS })).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: ANA })).toHaveCount(0);

    await page.getByLabel('Estado').selectOption('rejected');
    await expect(page.getByText('Ninguna llamada coincide con los filtros.')).toBeVisible();
    expect(failures).toEqual([]);
  });

  test('micrófono denegado: lo explica y la llamada sigue sonando sin aceptarse', async ({ page, request }) => {
    const failures = watchForFailures(page);
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('no'), { name: 'NotAllowedError' }));
    });
    await page.goto('/llamadas');
    await expect(page.getByRole('heading', { name: 'Llamadas' })).toBeVisible();
    const before = graphActions().length;
    const ID = `wacid.mic-${stamp}`;
    await callWebhook(request, PNID, connect(ID, '51987000003', `Mic ${stamp}`));
    const ring = page.getByRole('alertdialog', { name: `Mic ${stamp}` });
    await ring.getByRole('button', { name: 'Aceptar' }).click();
    const help = page.getByRole('alertdialog', { name: 'Micrófono no disponible' });
    await expect(help).toContainText('Permite el acceso');
    await help.getByRole('button', { name: 'Entendido' }).click();
    await expect(ring).toBeVisible();
    expect(graphActions().slice(before).filter((a) => a.kind === 'calls')).toEqual([]);
    await callWebhook(request, PNID, { calls: [{ id: ID, event: 'terminate', status: 'FAILED' }] });
    await expect(ring).toHaveCount(0);
    expect(failures).toEqual([]);
  });

  test('llamar desde el historial con permiso concedido', async ({ page }) => {
    const failures = watchForFailures(page);
    await page.goto('/llamadas');
    await page.locator('tbody tr', { hasText: ANA }).getByRole('button', { name: `Devolver llamada a ${ANA}` }).click();
    const dialog = page.getByRole('dialog', { name: `Llamar a ${ANA}` });
    await expect(dialog).toContainText('Permiso concedido');
    await dialog.getByRole('button', { name: 'Llamar', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Llamada en curso' });
    await expect(panel).toContainText('Llamando');
    expect(graphActions().some((a) => a.action === 'connect' && a.hasSdp)).toBe(true);
    await panel.getByRole('button', { name: 'Colgar' }).click();
    await expect(panel).toHaveCount(0);
    expect(failures).toEqual([]);
  });
});
