import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../fixtures/orbit.fixture';

test('keeps essential actions in reflow without horizontal viewport overflow', async ({ page }) => {
  test.setTimeout(120_000);
  for (const width of [360, 390, 430, 600, 768, 820, 1024, 1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/day/2026-08-13');
    await expect(page.getByRole('button', { name: /добавить задачу/i })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
});

test('has no serious axe violations and preserves non-color/status/reduced-motion semantics', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/history');
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
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
  await expect(page.getByRole('link', { name: /трениров|workout/i })).toHaveCount(0);
});
