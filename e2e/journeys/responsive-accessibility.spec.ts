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
  /*
   * REPLACED DEVICE-LOCAL STORAGE ASSERTION (recorded in traceability.md).
   *
   * 001 asserted the storage disclosure in the rail — that plans lived only in
   * this browser profile and could be cleared. 002 FR-015 removes exactly that
   * messaging because it no longer describes anything true. Every other
   * assertion in this test is unchanged.
   */
  await expect(page.locator('details[data-od-id="persistence-status"]')).toHaveCount(0);
  await expect(page.getByText(/только на этом устройстве/i)).toHaveCount(0);
  await expect(page.getByText(/Локальное хранение/i)).toHaveCount(0);
  await expect(page.getByRole('link', { name: /трениров|workout/i })).toHaveCount(0);
});
