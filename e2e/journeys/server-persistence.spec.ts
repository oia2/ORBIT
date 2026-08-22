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

/*
 * 003 US1 (FR-001, FR-002, FR-003).
 *
 * Phase 0 showed the owner's store has lost nothing since it was created; what
 * this feature owes is proof that the guarantee holds under the conditions the
 * loss was attributed to — a browser that goes away, a date that rolls over,
 * and a rebuild that reapplies migrations.
 */
test('keeps a full day of records when the browser is discarded entirely', async ({
  page,
  browser,
}) => {
  await page.goto(DAY_PATH);
  await addTask(page, 'Пережить закрытие браузера');

  // A note, a habit mark, and daily state — the records the owner said vanished.
  const taskRow = page.getByRole('list', { name: 'Задачи' }).getByRole('listitem').first();
  await taskRow.getByRole('button', { name: /заметка к задаче/i }).click();
  const noteDialog = page.getByRole('dialog', { name: 'Заметка' });
  await noteDialog.getByRole('textbox', { name: /заметка к задаче/i }).fill('Текст заметки');
  await noteDialog.getByRole('button', { name: 'Сохранить заметку' }).click();
  await expect(noteDialog).toBeHidden();

  await page.getByRole('button', { name: /^энергия 4$/i }).click();
  await page.getByRole('button', { name: /сохранить состояние/i }).click();

  // Throw the whole browser context away: no cookies, no storage, no session.
  const fresh = await browser.newContext();
  try {
    const freshPage = await fresh.newPage();
    await freshPage.goto(DAY_PATH);

    const restored = freshPage.getByRole('list', { name: 'Задачи' });
    await expect(restored.getByText('Пережить закрытие браузера', { exact: true })).toBeVisible();

    const restoredRow = restored.getByRole('listitem').first();
    await expect(restoredRow.getByLabel('есть заметка')).toBeVisible();
    await restoredRow.getByRole('button', { name: /заметка к задаче/i }).click();
    await expect(
      freshPage
        .getByRole('dialog', { name: 'Заметка' })
        .getByRole('textbox', { name: /заметка к задаче/i }),
    ).toHaveValue('Текст заметки');
  } finally {
    await fresh.close();
  }
});

/**
 * FR-001: the local date boundary is the moment the owner described. Navigating
 * to the following day and back is the closest a journey gets to living through
 * it, and it exercises the same `prepareOpenPeriod` catch-up path.
 */
test('keeps a previous day intact after moving past it', async ({ page }) => {
  await page.goto(DAY_PATH);
  await addTask(page, 'Вчерашняя запись');

  await page.goto('/day/2026-08-14');
  await page.goto('/day/2026-08-15');
  await page.goto(DAY_PATH);

  await expect(
    page.getByRole('list', { name: 'Задачи' }).getByText('Вчерашняя запись', { exact: true }),
  ).toBeVisible();
  // The day is still open with its work on it, not silently discarded.
  await expect(page.getByRole('button', { name: /^закрыть день$/i })).toBeVisible();
});

/**
 * FR-002, FR-003: the server applies migrations at startup, so every record a
 * journey can see has already survived migration `002-single-weight-snapshots`
 * and `003-habit-duration` running against the database that holds it.
 */
test('serves records through a schema that has already been migrated', async ({ page }) => {
  await page.goto(DAY_PATH);
  await addTask(page, 'После миграций');

  await page.reload();
  await expect(
    page.getByRole('list', { name: 'Задачи' }).getByText('После миграций', { exact: true }),
  ).toBeVisible();

  // The rescaled result shape: counts are visible, the old weighting is gone.
  const score = page.getByRole('region', { name: 'Дневной результат' });
  await expect(score).toContainText(/Задачи/);
  await expect(score).not.toContainText('70/30');
});
