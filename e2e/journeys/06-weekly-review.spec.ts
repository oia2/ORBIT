import { expect, test } from '../fixtures/orbit.fixture';

const weekStart = '2026-08-10';
const score = {
  task: { completed: 2, applicable: 3, rate: 2 / 3 },
  habit: { completed: 1, applicable: 2, rate: 1 / 2 },
  value: 62,
  weightsApplied: { task: 70, habit: 30 },
};

test('reviews and completes seven closed days with reflection and immutable reload', async ({
  page,
  orbitDatabase,
}) => {
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(Date.UTC(2026, 7, 10 + offset)).toISOString().slice(0, 10);
    return {
      status: 'closed',
      date,
      weekStart,
      revision: 1,
      closureSnapshot: { score, plannedLoadMinutes: 30 + offset },
      closedAt: `${date}T18:00:00.000Z`,
    };
  });
  await orbitDatabase.seed({
    version: 1,
    stores: {
      weeks: [
        {
          status: 'open',
          startDate: weekStart,
          goals: [
            {
              id: '123e4567-e89b-42d3-a456-426614174601',
              statement: 'Подготовить обзор',
              createdAt: '2026-08-10T08:00:00.000Z',
              updatedAt: '2026-08-10T08:00:00.000Z',
            },
          ],
          revision: 0,
        },
      ],
      days,
    },
  });
  await page.goto(`/week/${weekStart}`);
  await expect(page.getByRole('region', { name: /прогресс недели/i })).toContainText(/62%/);
  const progressComposition = page.getByRole('region', { name: /состав прогресса недели/i });
  await expect(
    progressComposition.getByRole('progressbar', { name: /выполнение задач недели/i }),
  ).toHaveAttribute('aria-valuenow', '67');
  await expect(progressComposition).toContainText(
    /задачи недели.*67%.*14 выполнено.*7 осталось.*привычки.*7 отметок.*7 из 14 выполнено/is,
  );
  await page.getByRole('button', { name: /завершить неделю/i }).click();
  const dialog = page.getByRole('dialog', { name: /завершить неделю/i });
  await expect(dialog).toContainText(/Подготовить обзор/);
  await dialog.getByLabel(/рефлексия/i).fill('Сохранять короткие планы');
  await dialog.getByRole('button', { name: /^завершить неделю$/i }).click();
  await expect(dialog).toBeHidden();
  const review = page.locator('#week-review');
  await expect(review).toContainText(
    /неделя завершена.*только для чтения.*Сохранять короткие планы/is,
  );
  await page.reload();
  await expect(review).toContainText(
    /неделя завершена.*только для чтения.*Сохранять короткие планы/is,
  );
  await expect(page.getByRole('button', { name: /добавить цель/i })).toBeDisabled();
  for (const button of await page.getByRole('button', { name: /добавить задачу/i }).all()) {
    await expect(button).toBeDisabled();
  }
  await expect(page.getByRole('button', { name: /завершить неделю/i })).toHaveCount(0);
  await page.goto('/week/2026-08-17');
  await expect(page.getByRole('heading', { name: /неделя/i })).toBeVisible();
});
