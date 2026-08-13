import { expect, test } from '../fixtures/orbit.fixture';

test('navigates immutable Day Week Month history with exact dynamics scopes', async ({
  page,
  orbitDatabase,
}) => {
  const score = {
    task: { completed: 2, applicable: 3, rate: 2 / 3 },
    habit: { completed: 1, applicable: 2, rate: 1 / 2 },
    value: 62,
    weightsApplied: { task: 70, habit: 30 },
  };
  await orbitDatabase.seed({
    version: 1,
    stores: {
      weeks: [{ status: 'open', startDate: '2026-08-10', goals: [], revision: 0 }],
      days: [
        {
          status: 'closed',
          date: '2026-08-13',
          weekStart: '2026-08-10',
          revision: 1,
          closureSnapshot: { score, plannedLoadMinutes: 45 },
          closedAt: '2026-08-13T18:00:00.000Z',
        },
      ],
    },
  });
  await page.goto('/history');
  await expect(page.getByText(/^история и динамика$/i)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /август 2026/i })).toBeVisible();
  await expect(page.getByText(/выбранная дата.*13 августа 2026/i)).toBeVisible();
  await expect(page.getByRole('group', { name: /календарь месяца/i })).toBeVisible();
  await expect(page.getByRole('region', { name: /динамика/i })).toContainText(
    /последние 6 месяцев/i,
  );
  await expect(page.getByRole('region', { name: /динамика/i }).getByRole('listitem')).toHaveCount(
    6,
  );
  await page.getByRole('button', { name: 'Неделя' }).click();
  await expect(page.getByText(/выбранная дата.*13 августа 2026/i)).toBeVisible();
  await expect(page.getByRole('region', { name: /динамика/i })).toContainText(
    /последние 8 недель/i,
  );
  await expect(page.getByRole('region', { name: /динамика/i }).getByRole('listitem')).toHaveCount(
    8,
  );
  await page.getByRole('button', { name: 'День' }).click();
  await expect(page.getByRole('region', { name: /динамика/i })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /открыть день/i })).toBeVisible();
  await expect(page.getByText(/фильтр|поиск|трениров|workout|корреляц|инсайт/i)).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
});
