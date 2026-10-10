import { test, expect } from '@playwright/test';
import { loginByUi, registerByApi, watchForFailures, type Account } from './support';

test.describe('CRM', () => {
  let account: Account;

  test.beforeAll(async ({ request }) => {
    account = await registerByApi(request);
  });

  test.beforeEach(async ({ page }) => {
    await loginByUi(page, account.email, account.password);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('todas las pantallas del menú abren sin errores', async ({ page }) => {
    const failures = watchForFailures(page);
    const links = page.locator('nav.nav a.nav-item');
    await expect(links.first()).toBeVisible();

    const routes = await links.evaluateAll((els) =>
      els.map((a) => a.getAttribute('href')).filter((h): h is string => !!h),
    );
    // Si el menú se queda corto es que los permisos no cargaron.
    expect(routes.length).toBeGreaterThan(8);

    for (const route of routes) {
      await page.locator(`nav.nav a.nav-item[href="${route}"]`).click();
      await expect(page, `no navegó a ${route}`).toHaveURL(new RegExp(`${route}(\\?|$)`));
      // Cada página pinta su propio contenido dentro del shell.
      await expect(page.locator('main, .main, .content').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
    }

    expect(failures).toEqual([]);
  });

  test('crea un contacto y lo encuentra en la tabla', async ({ page }) => {
    const failures = watchForFailures(page);
    const name = `Contacto ${Date.now()}`;

    await page.goto('/customers');
    await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Nuevo contacto' }).click();
    await page.getByPlaceholder('Ej: María García').fill(name);
    await page.getByPlaceholder('maria@email.com').fill(`c${Date.now()}@cliente.pe`);
    await page.getByPlaceholder('+51 999 999 999').fill('+51 999 123 456');
    await page.getByRole('button', { name: 'Crear contacto' }).click();

    await expect(page.locator('.toast-message', { hasText: 'Contacto creado' })).toBeVisible();
    await expect(page.getByText(name).first()).toBeVisible();

    await page.getByPlaceholder('Buscar por nombre, email o teléfono...').fill(name);
    await expect(page.getByText(name).first()).toBeVisible();

    // Sigue ahí tras recargar: se guardó en el servidor, no solo en pantalla.
    await page.reload();
    await expect(page.getByText(name).first()).toBeVisible();
    expect(failures).toEqual([]);
  });

  test('el formulario de contacto no envía si falta el nombre', async ({ page }) => {
    await page.goto('/customers');
    await page.getByRole('button', { name: 'Nuevo contacto' }).click();
    await page.getByRole('button', { name: 'Crear contacto' }).click();

    // El panel sigue abierto y no hay aviso de éxito.
    await expect(page.getByPlaceholder('Ej: María García')).toBeVisible();
    await expect(page.locator('.toast-message', { hasText: 'Contacto creado' })).toHaveCount(0);
  });

  test('crea una lista de contactos', async ({ page }) => {
    const failures = watchForFailures(page);
    const name = `Lista ${Date.now()}`;

    await page.goto('/lists');
    await expect(page.getByRole('heading', { name: 'Listas de Contactos' })).toBeVisible();

    await page.locator('button.btn-primary.btn-lg').click();
    await page.getByPlaceholder('Ej: Clientes VIP, Inactivos 30d').fill(name);
    await page.getByRole('button', { name: 'Guardar lista' }).click();

    await expect(page.getByText(name).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(name).first()).toBeVisible();
    expect(failures).toEqual([]);
  });

  test('crea un usuario y este entra con su contraseña temporal', async ({ page }) => {
    const email = `vendedor-${Date.now()}@e2e.test`;

    await page.goto('/users');
    await expect(page.getByRole('heading', { name: 'Usuarios', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /usuario/i }).first().click();
    await page.getByPlaceholder('Nombre completo').fill('Vendedor Nuevo');
    await page.getByPlaceholder('correo@empresa.com').fill(email);
    await page.locator('select[name="role"]').selectOption('MARKETING');
    await page.locator('form button[type="submit"]').click();

    const tempPassword = (await page.locator('.cred-pass').innerText()).trim();
    expect(tempPassword).toMatch(/^Tmp@/);
    await page.getByRole('button', { name: 'Entendido' }).click();

    await page.locator('.logout-btn').click();
    await expect(page).toHaveURL(/\/login/);

    await loginByUi(page, email, tempPassword);
    // Con contraseña temporal lo primero es cambiarla.
    await expect(page).toHaveURL(/\/change-password/);
    await expect(page.getByRole('heading', { name: 'Cambiar contraseña' })).toBeVisible();
  });
});
