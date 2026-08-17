import { expect, test } from '../fixtures/orbit.fixture';

test('keeps IndexedDB facts across reload and deep-link refresh without account or sync UI', async ({
  page,
}) => {
  await page.goto('/day/2026-08-13');
  await page.getByRole('button', { name: /добавить задачу/i }).click();
  const dialog = page.getByRole('dialog', { name: /новая задача/i });
  await dialog.getByLabel(/название задачи/i).fill('Локальная запись');
  await dialog.getByLabel(/длительность/i).fill('25');
  await dialog.getByRole('button', { name: /сохранить/i }).click();
  await expect(
    page.getByRole('list', { name: 'Задачи' }).getByText('Локальная запись', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/day\/2026-08-13$/);
  await expect(
    page.getByRole('list', { name: 'Задачи' }).getByText('Локальная запись', { exact: true }),
  ).toBeVisible();
  const persistence = page.locator('details[data-od-id="persistence-status"]');
  const persistenceSummary = persistence.locator('summary');
  await expect(persistenceSummary.getByRole('status')).toHaveText(
    /сохранено на устройстве|хранение не гарантировано/i,
  );
  await persistenceSummary.click();
  await expect(persistence).toHaveAttribute('open', '');
  await expect(persistence.getByText('Локальное хранение', { exact: true })).toBeVisible();
  await expect(persistence.locator('p')).toContainText(
    /планы хранятся только на этом устройстве|браузер не (?:предоставил|поддерживает).*постоянн/i,
  );
  await expect(persistence.locator('p')).toContainText(
    /данные могут исчезнуть|могут удалить данные|очистят хранилище|могут быть очищены автоматически/i,
  );
  await expect(page.getByRole('link', { name: /войти|регистрац|аккаунт|синхрон/i })).toHaveCount(0);
});
