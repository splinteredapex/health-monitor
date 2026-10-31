import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { collectErrors, noHorizontalOverflow, onboard } from './helpers';

test('onboarding creates the programme and dashboard', async ({ page }) => {
  const errors = collectErrors(page);
  await onboard(page);
  await expect(page.getByText(/Week 1 of 12 · day 1/)).toBeVisible();
  await expect(page.getByText('Book a GP / practice nurse BP review')).toBeVisible();
  await noHorizontalOverflow(page);
  for (const name of ['My Plan', 'Record', 'Progress', 'Settings']) {
    await page.getByRole('navigation', { name: 'Main' }).last().getByRole('link', { name }).click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    await noHorizontalOverflow(page);
  }
  expect(errors).toEqual([]);
});

test('BP create, edit, chart, verified completion and persistence', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/record/bp');
  await page.getByRole('radio', { name: 'Morning' }).click();
  await page.getByLabel('Time').first().fill('07:30');
  const sys = page.getByLabel('Systolic');
  const dia = page.getByLabel('Diastolic');
  await sys.nth(0).fill('142');
  await dia.nth(0).fill('91');
  await sys.nth(1).fill('138');
  await dia.nth(1).fill('88');
  await page.getByRole('button', { name: 'Save readings' }).click();
  await expect(page.getByText(/Saved 2 readings – session average 140\/90/)).toBeVisible();
  await expect(page.getByText(/2 home readings on 1 day; average 140\/90/)).toBeVisible();

  await page.getByRole('button', { name: /Edit reading 142 over 91/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit reading' });
  await dialog.getByLabel('Systolic').fill('144');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('button', { name: /Edit reading 144 over 91/ })).toBeVisible();

  // Invalid entry is rejected accessibly
  await sys.nth(0).fill('80');
  await dia.nth(0).fill('90');
  await page.getByRole('button', { name: 'Save readings' }).click();
  await expect(page.getByText('Systolic must be higher than diastolic')).toBeVisible();

  await page.goto('/#/dashboard');
  await expect(page.getByText(/2 morning readings recorded/)).toBeVisible();
  await page.reload();
  await expect(page.getByText('141/90').first()).toBeVisible();
});

test('very high reading shows emergency advice', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/record/bp');
  await page.getByLabel('Systolic').first().fill('185');
  await page.getByLabel('Diastolic').first().fill('115');
  await page.getByRole('button', { name: 'Save readings' }).click();
  await expect(page.getByText('Very high reading').first()).toBeVisible();
  await expect(page.getByText(/call 999 now/).first()).toBeVisible();
});

test('daily checklist complete and undo', async ({ page }) => {
  await onboard(page);
  const gp = page.getByRole('listitem').filter({ hasText: 'Book a GP / practice nurse BP review' });
  await gp.getByRole('button', { name: /Mark ".*" done/ }).click();
  await expect(gp.getByText('Done (self-confirmed)')).toBeVisible();
  await page.reload();
  await expect(gp.getByText('Done (self-confirmed)')).toBeVisible();
  await gp.getByRole('button', { name: /^Undo/ }).click();
  await expect(gp.getByText('To do')).toBeVisible();
});

test('exercise, sleep and lifestyle entry', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/record/exercise');
  await page.getByRole('button', { name: 'Cycling' }).click();
  await page.getByLabel('Duration').fill('35');
  await page.getByRole('button', { name: 'Save session' }).click();
  await expect(page.getByText(/Cycling · 35 min · moderate/)).toBeVisible();

  await page.goto('/#/record/sleep');
  await page.getByLabel('Bedtime').fill('23:15');
  await page.getByLabel('Wake time').fill('06:45');
  await expect(page.getByText('7h 30m').first()).toBeVisible();
  await page.getByRole('button', { name: 'Save sleep' }).click();
  await expect(page.getByText('23:15 → 06:45')).toBeVisible();

  await page.goto('/#/record/lifestyle');
  await page.getByRole('button', { name: 'One more portion' }).click();
  await page.getByRole('button', { name: 'One more portion' }).click();
  await page.getByRole('button', { name: 'None today' }).click();
  await page.getByRole('button', { name: 'Save day' }).click();
  await expect(page.getByText('Recorded – edit and save to update.')).toBeVisible();
  await expect(page.getByText(/1 of 7 days recorded/)).toBeVisible();
});

test('JSON export, reset and restore', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/record/body');
  await page.getByRole('textbox', { name: 'Weight' }).fill('85.4');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.goto('/#/settings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export backup' }).click()]);
  const file = await dl.path();
  const json = JSON.parse(readFileSync(file, 'utf8'));
  expect(json.format).toBe('health-recovery-backup');
  expect(json.tables.weights).toHaveLength(1);

  await page.getByRole('button', { name: 'Delete everything…' }).click();
  await page.getByLabel('Type "DELETE" to confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible();

  await onboard(page);
  await page.goto('/#/settings');
  await page.getByLabel('Choose backup file').setInputFiles(file);
  await expect(page.getByRole('dialog', { name: 'Restore backup' })).toBeVisible();
  await page.getByRole('button', { name: 'Replace all' }).click();
  await page.getByRole('dialog', { name: 'Replace all data?' }).getByRole('button', { name: 'Replace' }).click();
  await page.goto('/#/record/body');
  await expect(page.getByText('85.4').first()).toBeVisible();

  // CSV export
  await page.goto('/#/settings');
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download' }).first().click()]);
  expect(csv.suggestedFilename()).toMatch(/blood-pressure.*\.csv/);
});

test('rejects an invalid backup without changing data', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/settings');
  await page.getByLabel('Choose backup file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"nope"}') });
  await expect(page.getByText('Backup not imported')).toBeVisible();
  await expect(page.getByText('Nothing was changed.')).toBeVisible();
});

test('works offline after first load', async ({ page, context }) => {
  await onboard(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByText(/Offline – everything still works/)).toBeVisible();
  await page.goto('/#/record/body');
  await page.getByRole('textbox', { name: 'Weight' }).fill('86.2');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('86.2 kg').first()).toBeVisible();
  await context.setOffline(false);
});

test('manifest is installable', async ({ page }) => {
  const res = await page.request.get('/manifest.webmanifest');
  const m = await res.json();
  expect(m.display).toBe('standalone');
  expect(m.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true);
  await page.goto('/');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
});
