import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/orbit.fixture';

const DAY_PATH = '/day/2026-08-13';

async function addTask(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: /добавить задачу/i }).click();
  const dialog = page.getByRole('dialog', { name: /новая задача/i });
  await dialog.getByLabel(/название задачи/i).fill(title);
  await dialog.getByLabel(/длительность/i).fill('25');
  await dialog.getByRole('button', { name: /сохранить/i }).click();
  await expect(
    page.getByRole('list', { name: 'Задачи' }).getByText(title, { exact: true }),
  ).toBeVisible();
}

async function readBrowserStorage(page: Page) {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases();
    return {
      databaseNames: databases.map((database) => database.name ?? ''),
      localStorageKeys: Object.keys(localStorage),
      sessionStorageKeys: Object.keys(sessionStorage),
    };
  });
}

/**
 * Replaces feature 001's device-local persistence journey.
 *
 * 001 proved that facts survived a reload *in this browser profile*. 002 has to
 * prove the opposite property: the data is not tied to the browser at all.
 */
test('keeps facts across reload and deep-link refresh without account or sync UI', async ({
  page,
}) => {
  await page.goto(DAY_PATH);
  await addTask(page, 'Серверная запись');

  await page.reload();
  await expect(page).toHaveURL(/\/day\/2026-08-13$/);
  await expect(
    page.getByRole('list', { name: 'Задачи' }).getByText('Серверная запись', { exact: true }),
  ).toBeVisible();

  // 002 FR-021, FR-022: still one user, still no accounts and no sync surface.
  await expect(page.getByRole('link', { name: /войти|регистрац|аккаунт|синхрон/i })).toHaveCount(0);
  // 002 FR-015: no device-local storage claim survives.
  await expect(page.locator('details[data-od-id="persistence-status"]')).toHaveCount(0);
});

/** SC-002: the same data is visible from a different browser. */
test('shows the same plan in a second, independent browser context', async ({ page, browser }) => {
  await page.goto(DAY_PATH);
  await addTask(page, 'Видно из другого браузера');

  const otherContext = await browser.newContext();
  try {
    const otherPage = await otherContext.newPage();
    await otherPage.goto(DAY_PATH);

    await expect(
      otherPage
        .getByRole('list', { name: 'Задачи' })
        .getByText('Видно из другого браузера', { exact: true }),
    ).toBeVisible();
  } finally {
    await otherContext.close();
  }
});

/** SC-003: clearing all site data loses nothing, because nothing was stored there. */
test('survives clearing every trace of site data in the browser', async ({ page, context }) => {
  await page.goto(DAY_PATH);
  await addTask(page, 'Переживёт очистку');

  await context.clearCookies();
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    // Whatever a browser may have kept, none of it is ORBIT's planning data.
    const databases = await indexedDB.databases();
    for (const database of databases) {
      if (database.name !== undefined) indexedDB.deleteDatabase(database.name);
    }
  });

  await page.reload();
  await expect(
    page.getByRole('list', { name: 'Задачи' }).getByText('Переживёт очистку', { exact: true }),
  ).toBeVisible();
});

/** SC-008: browser storage holds no planning records during normal operation. */
test('stores no planning records in the browser', async ({ page }) => {
  await page.goto(DAY_PATH);
  await addTask(page, 'Только на сервере');

  const browserStorage = await readBrowserStorage(page);

  expect(browserStorage.databaseNames).not.toContain('orbit-planning');
  expect(browserStorage.databaseNames).toEqual([]);
  expect(browserStorage.localStorageKeys).toEqual([]);
  expect(browserStorage.sessionStorageKeys).toEqual([]);
});
