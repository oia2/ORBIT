import { expect, test } from '../fixtures/orbit.fixture';
import { dayMonthYearLabel, labelPattern, mondayISO, monthYearLabel, todayISO } from './dates';

test('navigates immutable Day Week Month history with exact dynamics scopes', async ({
  page,
  orbitDatabase,
}) => {
  test.setTimeout(120_000);
  const score = {
    task: { completed: 2, applicable: 3, rate: 2 / 3 },
    habit: { completed: 1, applicable: 2, rate: 1 / 2 },
    value: 62,
    weightsApplied: { task: 70, habit: 30 },
  };
  await orbitDatabase.seed({
    version: 1,
    stores: {
      weeks: [{ status: 'open', startDate: mondayISO(), goals: [], revision: 0 }],
      days: [
        {
          status: 'closed',
          date: todayISO(),
          weekStart: mondayISO(),
          revision: 1,
          closureSnapshot: { score, plannedLoadMinutes: 45 },
          closedAt: `${todayISO()}T18:00:00.000Z`,
        },
      ],
    },
  });
  await page.goto('/history');
  await expect(page.getByText(/^история и динамика$/i)).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: labelPattern(monthYearLabel(todayISO())) }),
  ).toBeVisible();
  await expect(
    page.getByText(new RegExp(`выбранная дата.*${dayMonthYearLabel(todayISO())}`, 'i')),
  ).toBeVisible();
  await expect(page.getByRole('group', { name: /календарь месяца/i })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('region', { name: /динамика/i })).toContainText(
    /последние 6 месяцев/i,
  );
  await expect(page.getByRole('region', { name: /динамика/i }).getByRole('listitem')).toHaveCount(
    6,
  );
  await page.getByRole('button', { name: 'Неделя' }).click();
  await expect(
    page.getByText(new RegExp(`выбранная дата.*${dayMonthYearLabel(todayISO())}`, 'i')),
  ).toBeVisible();
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
