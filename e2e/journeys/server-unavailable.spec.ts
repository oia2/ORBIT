import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/orbit.fixture';

const DAY_PATH = '/day/2026-08-13';

/** Makes every planning call fail the way an unreachable server would. */
async function cutTheServerOff(page: Page): Promise<void> {
  await page.route('**/api/**', async (route) => {
    await route.abort('failed');
  });
}

async function restoreTheServer(page: Page): Promise<void> {
  await page.unroute('**/api/**');
}

async function addTask(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: /добавить задачу/i }).click();
  const dialog = page.getByRole('dialog', { name: /новая задача/i });
  await dialog.getByLabel(/название задачи/i).fill(title);
  await dialog.getByLabel(/длительность/i).fill('25');
  await dialog.getByRole('button', { name: /сохранить/i }).click();
}

/**
 * SC-004: an unreachable server is reported, never hidden.
 *
 * The failure mode this guards against is the quiet one — an empty plan shown
 * as if it were the real plan, or an unsaved change shown as saved. Feature
 * 001's honest-reporting rule is what 002 has to keep true across a network.
 */
test('reports an unreachable server on load instead of showing an empty plan', async ({ page }) => {
  await cutTheServerOff(page);
  await page.goto(DAY_PATH);

  const alert = page.getByRole('alert').first();
  await expect(alert).toBeVisible();
  // Not "no tasks yet": the difference between "nothing is planned" and "we
  // could not find out" is the whole point of FR-012.
  await expect(page.getByText(/В плане пока нет задач/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /повторить/i }).first()).toBeVisible();
});

test('never presents an unsaved change as saved when the server goes away mid-session', async ({
  page,
}) => {
  await page.goto(DAY_PATH);
  await expect(page.getByRole('button', { name: /добавить задачу/i })).toBeVisible();

  await cutTheServerOff(page);
  await addTask(page, 'Не должно сохраниться');

  await expect(page.getByRole('alert').first()).toBeVisible();
  // The task is not in the plan, because it was never written.
  await expect(
    page.getByRole('list', { name: 'Задачи' }).getByText('Не должно сохраниться', { exact: true }),
  ).toHaveCount(0);

  await restoreTheServer(page);
  await page.reload();

  // And it is still absent after a reload against the real server, which is
  // what proves the failure was honest rather than cosmetic.
  await expect(page.getByRole('button', { name: /добавить задачу/i })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Задачи' }).getByText('Не должно сохраниться', { exact: true }),
  ).toHaveCount(0);
});

test('recovers when the server returns, with prior data intact', async ({ page }) => {
  await page.goto(DAY_PATH);
  await addTask(page, 'Записано до сбоя');
  await expect(
    page.getByRole('list', { name: 'Задачи' }).getByText('Записано до сбоя', { exact: true }),
  ).toBeVisible();

  await cutTheServerOff(page);
  await page.reload();
  await expect(page.getByRole('alert').first()).toBeVisible();

  await restoreTheServer(page);
  await page.reload();

  await expect(
    page.getByRole('list', { name: 'Задачи' }).getByText('Записано до сбоя', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
