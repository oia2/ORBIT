import type { Locator } from '@playwright/test';

import { expect, test } from '../fixtures/orbit.fixture';
import { activate, exposeDetails, exposeItemActions, weekPlannerDay } from './journey-helpers';
import {
  dayMonthYearLabel,
  labelPattern,
  mondayISO,
  plannerDayPattern,
  shiftedISO,
  todayISO,
  weekDayISO,
  weekdayLabel,
} from './dates';

// Recurrence changes take effect on D+1, so the exercised days must always be in
// the future: the journey plans in next week rather than a pinned calendar week.
const WEEK = mondayISO(1);
const THURSDAY = weekDayISO(3, 1);
const FRIDAY = weekDayISO(4, 1);
const EFFECTIVE_FROM = shiftedISO(1);

async function fillRule(
  dialog: Locator,
  input: {
    title: string;
    duration?: string;
    /** Habit dialogs no longer collect dates; ORBIT assigns the effective start itself. */
    start?: string;
    end?: string;
    weekdays: readonly RegExp[];
  },
) {
  await dialog.getByLabel(/название задачи|название привычки/i).fill(input.title);
  if (input.duration !== undefined) await dialog.getByLabel(/длительность/i).fill(input.duration);
  if (input.start !== undefined) await dialog.getByLabel(/дата начала/i).fill(input.start);
  if (input.end !== undefined) await dialog.getByLabel(/дата окончания/i).fill(input.end);
  for (const weekday of input.weekdays) await dialog.getByLabel(weekday).check();
}

test('creates, changes and stops recurrence while preserving explicit facts and append order', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto(`/week/${WEEK}`);
  const thursday = weekPlannerDay(page, plannerDayPattern(THURSDAY));
  await exposeDetails(page, thursday, testInfo.project.name);
  await activate(
    page,
    thursday.getByRole('button', { name: /добавить задачу/i }),
    testInfo.project.name,
  );
  let dialog = page.getByRole('dialog', { name: /новая задача/i });
  await dialog.getByLabel(/название задачи/i).fill('Существующая задача');
  await dialog.getByLabel(/длительность/i).fill('15');
  await activate(page, dialog.getByRole('button', { name: /сохранить/i }), testInfo.project.name);
  await expect(dialog).toBeHidden();

  await activate(
    page,
    page.getByRole('button', { name: 'Добавить повтор задачи' }),
    testInfo.project.name,
  );
  dialog = page.getByRole('dialog', { name: /новая повторяющаяся задача/i });
  await fillRule(dialog, {
    title: 'Повторяемая задача',
    duration: '0',
    start: WEEK,
    end: FRIDAY,
    weekdays: [labelPattern(weekdayLabel(THURSDAY)), labelPattern(weekdayLabel(FRIDAY))],
  });
  await activate(page, dialog.getByRole('button', { name: /сохранить/i }), testInfo.project.name);
  await expect(dialog.getByRole('alert')).toContainText(/больше нуля/i);
  await dialog.getByLabel(/длительность/i).fill('25');
  await expect(dialog.getByText(/дата окончания включительно/i)).toBeVisible();
  await activate(page, dialog.getByRole('button', { name: /сохранить/i }), testInfo.project.name);
  await expect(dialog).toBeHidden();

  await exposeDetails(page, thursday, testInfo.project.name);
  await expect(thursday.getByRole('list', { name: /задачи/i }).getByRole('listitem')).toHaveText([
    /Существующая задача.*15 мин/,
    /Повторяемая задача.*25 мин/,
  ]);
  const friday = weekPlannerDay(page, plannerDayPattern(FRIDAY));
  await exposeDetails(page, friday, testInfo.project.name);
  const future = friday.getByRole('listitem').filter({ hasText: 'Повторяемая задача' });
  let taskActions = await exposeItemActions(
    page,
    future,
    /действия с задачей.*Повторяемая задача/i,
    testInfo.project.name,
  );
  await activate(
    page,
    taskActions.getByRole('button', { name: /^редактировать$/i }),
    testInfo.project.name,
  );
  dialog = page.getByRole('dialog', { name: /редактировать задачу/i });
  await dialog.getByLabel(/название задачи/i).fill('Личное исключение');
  await activate(page, dialog.getByRole('button', { name: /сохранить/i }), testInfo.project.name);
  await expect(dialog).toBeHidden();
  await exposeDetails(page, thursday, testInfo.project.name);
  const recurring = thursday.getByRole('listitem').filter({ hasText: 'Повторяемая задача' });
  taskActions = await exposeItemActions(
    page,
    recurring,
    /действия с задачей.*Повторяемая задача/i,
    testInfo.project.name,
  );
  await activate(
    page,
    taskActions.getByRole('button', { name: 'Изменить повтор' }),
    testInfo.project.name,
  );
  dialog = page.getByRole('dialog', { name: /изменить повтор задачи/i });
  await expect(dialog.getByText(labelPattern(dayMonthYearLabel(EFFECTIVE_FROM)))).toBeVisible();
  await dialog.getByLabel(labelPattern(weekdayLabel(FRIDAY))).uncheck();
  await activate(page, dialog.getByRole('button', { name: /сохранить/i }), testInfo.project.name);
  await expect(dialog).toBeHidden();
  await exposeDetails(page, friday, testInfo.project.name);
  await expect(friday.getByText('Личное исключение', { exact: true })).toBeVisible();

  await activate(
    page,
    page.getByRole('button', { name: 'Добавить повтор задачи' }),
    testInfo.project.name,
  );
  dialog = page.getByRole('dialog', { name: /новая повторяющаяся задача/i });
  await fillRule(dialog, {
    title: 'Остановить задачу',
    duration: '10',
    start: WEEK,
    weekdays: [labelPattern(weekdayLabel(THURSDAY))],
  });
  await activate(page, dialog.getByRole('button', { name: /сохранить/i }), testInfo.project.name);
  await expect(dialog).toBeHidden();
  await exposeDetails(page, thursday, testInfo.project.name);
  const stoppable = thursday.getByRole('listitem').filter({ hasText: 'Остановить задачу' });
  taskActions = await exposeItemActions(
    page,
    stoppable,
    /действия с задачей.*Остановить задачу/i,
    testInfo.project.name,
  );
  await activate(
    page,
    taskActions.getByRole('button', { name: 'Изменить повтор' }),
    testInfo.project.name,
  );
  dialog = page.getByRole('dialog', { name: /изменить повтор задачи/i });
  await activate(
    page,
    dialog.getByRole('button', { name: /остановить повтор/i }),
    testInfo.project.name,
  );

  await page.goto(`/day/${todayISO()}`);
  await activate(
    page,
    page.getByRole('button', { name: 'Добавить привычку' }),
    testInfo.project.name,
  );
  dialog = page.getByRole('dialog', { name: /новая привычка/i });
  await fillRule(dialog, {
    title: 'Прогулка',
    weekdays: [labelPattern(weekdayLabel(todayISO()))],
  });
  await activate(page, dialog.getByRole('button', { name: /сохранить/i }), testInfo.project.name);
  await expect(dialog).toBeHidden();
  const habit = page.getByRole('listitem').filter({ hasText: 'Прогулка' });
  // A habit's effective start is today, so a freshly created one is always
  // pending; the automatic date-boundary miss and its correction are covered by
  // the domain and adapter suites instead.
  await expect(habit).toContainText(/ожидает отметки/i);
  await activate(
    page,
    habit.getByRole('button', { name: /отметить .*выполненной/i }),
    testInfo.project.name,
  );
  await expect(habit).toContainText(/выполнено/i);
  let habitActions = await exposeItemActions(
    page,
    habit,
    /действия с привычкой.*Прогулка/i,
    testInfo.project.name,
  );
  await activate(
    page,
    habitActions.getByRole('button', { name: /изменить повтор/i }),
    testInfo.project.name,
  );
  dialog = page.getByRole('dialog', { name: /изменить повтор привычки/i });
  // Unlike a task series, a habit's rule change reaches the current day.
  await expect(dialog.getByText(labelPattern(dayMonthYearLabel(todayISO())))).toBeVisible();
  await dialog.getByLabel(labelPattern(weekdayLabel(THURSDAY))).check();
  await activate(page, dialog.getByRole('button', { name: /сохранить/i }), testInfo.project.name);
  await expect(dialog).toBeHidden();

  await activate(
    page,
    page.getByRole('button', { name: 'Добавить привычку' }),
    testInfo.project.name,
  );
  dialog = page.getByRole('dialog', { name: /новая привычка/i });
  await fillRule(dialog, { title: 'Вода', weekdays: [labelPattern(weekdayLabel(todayISO()))] });
  await activate(page, dialog.getByRole('button', { name: /сохранить/i }), testInfo.project.name);
  await expect(dialog).toBeHidden();
  const water = page.getByRole('listitem').filter({ hasText: 'Вода' });
  habitActions = await exposeItemActions(
    page,
    water,
    /действия с привычкой.*Вода/i,
    testInfo.project.name,
  );
  // Habits no longer expose a stop-recurrence action; deleting the occurrence is
  // the remaining explicit removal path.
  await activate(
    page,
    habitActions.getByRole('button', { name: /^удалить$/i }),
    testInfo.project.name,
  );
  await expect(page.getByRole('listitem').filter({ hasText: 'Вода' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('listitem').filter({ hasText: 'Прогулка' })).toContainText(
    /выполнено/i,
  );
  await expect(page.getByText(/тренировк|workout/i)).toHaveCount(0);
});
