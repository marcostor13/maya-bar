import { test, expect } from '@playwright/test';
import { ADMIN, loginByUi, registerByApi } from './support';

test.describe('Acceso', () => {
  test('la landing pública carga sin sesión', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page).toHaveTitle(/Maya/i);
  });

  test('las páginas legales son públicas (las pide Meta)', async ({ page }) => {
    for (const [path, title] of [
      ['/privacidad', 'Política de privacidad'],
      ['/terminos', 'Términos del servicio'],
      ['/eliminacion-datos', 'Eliminación de datos'],
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path));
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    }
  });

  test('una ruta privada sin sesión lleva al login', async ({ page }) => {
    await page.goto('/customers');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: 'Bienvenido a Maya' })).toBeVisible();
  });

  test('credenciales incorrectas muestran el error y no entran', async ({ page }) => {
    await loginByUi(page, 'nadie@e2e.test', 'incorrecta');
    // En línea dentro del formulario y además como toast.
    await expect(page.locator('.alert-error')).toHaveText('Credenciales incorrectas');
    await expect(page.locator('.toast-message', { hasText: 'Credenciales incorrectas' })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('sin registro gratis: /register lleva al checkout con el plan (HU87)', async ({ page }) => {
    await page.goto('/register?plan=crece&pago=anual');
    await expect(page).toHaveURL(/\/checkout\?.*plan=crece/);
    await expect(page).toHaveURL(/periodo=anual/);
  });

  test('cuenta nueva: cambia la clave temporal, entra, sale y vuelve a entrar', async ({ page, request }) => {
    const account = await registerByApi(request, { keepTemporary: true });

    await loginByUi(page, account.email, account.temporary);
    await expect(page).toHaveURL(/\/change-password/);
    await page.getByPlaceholder('Contraseña recibida').fill(account.temporary);
    await page.getByPlaceholder('Mínimo 8 caracteres').fill(account.password);
    await page.getByPlaceholder('Repite la nueva contraseña').fill(account.password);
    await page.locator('button[type="submit"]').click();
    await expect(page).not.toHaveURL(/\/change-password/);
    await expect(page.locator('nav.nav')).toBeVisible();

    await page.locator('.logout-btn').click();
    await expect(page).toHaveURL(/\/login/);

    await loginByUi(page, account.email, account.password);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('la sesión sobrevive a recargar la página', async ({ page, request }) => {
    const account = await registerByApi(request);
    await loginByUi(page, account.email, account.password);
    await expect(page).toHaveURL(/\/dashboard/);

    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('nav.nav')).toBeVisible();
  });

  test('el superadmin entra al panel de empresas y no al CRM', async ({ page, request }) => {
    const account = await registerByApi(request);

    await loginByUi(page, ADMIN.email, ADMIN.password);
    await expect(page).toHaveURL(/\/admin\/tenants/);
    await expect(page.getByRole('heading', { name: 'Empresas' })).toBeVisible();
    await expect(page.getByText(account.company)).toBeVisible();
  });

  test('un administrador de empresa no entra al panel de superadmin', async ({ page, request }) => {
    const account = await registerByApi(request);
    await loginByUi(page, account.email, account.password);
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/admin/tenants');
    await expect(page).not.toHaveURL(/\/admin\/tenants/);
  });
});
