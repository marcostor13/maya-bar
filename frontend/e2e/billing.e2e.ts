import { test, expect } from '@playwright/test';
import { loginByUi, registerByApi, watchForFailures, type Account } from './support';

/** HU44 C4: Mi plan en un móvil de 375 px, sin desplazamiento horizontal. */
test.describe('Mi plan y consumo', () => {
  let account: Account;

  test.beforeAll(async ({ request }) => {
    account = await registerByApi(request, { paidPlan: true });
  });

  test('se ve completo a 375 px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    const failures = watchForFailures(page);
    await loginByUi(page, account.email, account.password);
    await expect(page).toHaveURL(/\/dashboard/);
    await page.goto('/settings/plan');
    await expect(page.getByRole('heading', { name: 'Mi plan y consumo' })).toBeVisible();
    await expect(page.locator('[data-key="users"]')).toBeVisible();
    await expect(page.locator('form input[name="docNumber"]')).toBeVisible();
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(failures).toEqual([]);
  });
});
