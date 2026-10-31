import { expect, type Page } from '@playwright/test';

export async function onboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Before you start' })).toBeVisible();
  await page.getByLabel(/I understand this app/).check();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Date of birth (optional)').fill('1987-05-01');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start my programme' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

export async function noHorizontalOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(1);
}

export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}
