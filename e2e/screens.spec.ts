import { test } from '@playwright/test';
import { onboard } from './helpers';
const dir = process.env.SHOTS;
test.skip(!dir, 'screenshots only on demand');
test('screens', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/record/bp');
  for (const [s, d] of [['138', '88'], ['134', '86']]) {
    await page.getByLabel('Systolic').first().fill(s); await page.getByLabel('Diastolic').first().fill(d);
    await page.getByRole('button', { name: 'Save readings' }).click();
  }
  await page.goto('/#/dashboard');
  await page.screenshot({ path: `${dir}/dashboard.png`, fullPage: true });
  await page.goto('/#/record/bp');
  await page.screenshot({ path: `${dir}/bp.png`, fullPage: true });
  await page.goto('/#/plan');
  await page.screenshot({ path: `${dir}/plan.png` });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/#/progress');
  await page.screenshot({ path: `${dir}/progress-dark.png`, fullPage: true });
});
