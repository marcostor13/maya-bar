import { test, expect } from '@playwright/test';
import { ADMIN, loginByUi, newAccount, registerByApi } from './support';

test.describe('Acceso', () => {
  test('la landing pública carga sin sesión', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page).toHaveTitle(/Maya/i);
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

  test('registro, onboarding, cierre de sesión y nuevo ingreso', async ({ page }) => {
    const account = newAccount();

    await page.goto('/register');
    await page.getByPlaceholder('Ej: Restaurante La Mar S.A.C.').fill(account.company);
    await page.getByPlaceholder('contacto@tunegocio.com').fill(account.email);
    await page.getByPlaceholder('Juan Pérez').fill('Dueña de Prueba');
    await page.getByPlaceholder('Mínimo 8 caracteres').fill(account.password);
    await page.getByRole('button', { name: 'Crear cuenta gratis' }).click();

    await expect(page).toHaveURL(/\/onboarding/);
    await page.locator('.type-card').first().click();
    await page.getByRole('button', { name: /Continuar/ }).click();
    await page.getByPlaceholder('Ej: La Mar Cebichería').fill('Local Central');
    await page.getByRole('button', { name: /Continuar/ }).click();
    await page.getByRole('button', { name: 'Crear mi local' }).click();

    await expect(page).toHaveURL(/\/dashboard/);
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
