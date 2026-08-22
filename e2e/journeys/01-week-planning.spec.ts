import type { Locator, Page, TestInfo } from '@playwright/test';

import { expect, test } from '../fixtures/orbit.fixture';
import { activate, exposeDetails, exposeItemActions, weekPlannerDay } from './journey-helpers';

const WEEK_START = '2026-08-10';
const TUESDAY = '2026-08-11';

async function addGoal(
  page: Page,
  statement: string,
  projectName: TestInfo['project']['name'],
): Promise<void> {
  await activate(page, page.getByRole('button', { name: /добавить цель/i }), projectName);
  const dialog = page.getByRole('dialog', { name: /новая цель|цель недели/i });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/цель недели|формулировка/i).fill(statement);
  await activate(page, dialog.getByRole('button', { name: /сохранить/i }), projectName);
  await expect(dialog).toBeHidden();
}

async function addTask(
  page: Page,
  day: Locator,
  title: string,
  duration: number,
  projectName: TestInfo['project']['name'],
): Promise<void> {
  await exposeDetails(page, day, projectName);
  await activate(page, day.getByRole('button', { name: /добавить задачу/i }), projectName);
  const dialog = page.getByRole('dialog', { name: /новая задача|задача/i });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/название задачи|название/i).fill(title);
  await dialog.getByLabel(/длительность.*минут/i).fill(String(duration));
  await activate(page, dialog.getByRole('button', { name: /сохранить/i }), projectName);
  await expect(dialog).toBeHidden();
}

test('plans one fixed week consistently with keyboard and touch-ready controls', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto(`/week/${WEEK_START}`);

  await expect(page).toHaveURL(new RegExp(`/week/${WEEK_START}$`));
  await expect(page.getByRole('heading', { level: 1, name: /неделя/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /войти|регистрац|аккаунт/i })).toHaveCount(0);

  await addGoal(page, '  Подготовить   обзор  ', testInfo.project.name);
  await addGoal(page, 'Сверить план', testInfo.project.name);

  const goals = page.getByRole('list', { name: /цели недели/i });
  await expect(goals.getByRole('listitem')).toHaveText([/Подготовить {3}обзор/, /Сверить план/]);
  let goalActions = await exposeItemActions(
    page,
    goals,
    /действия с целью.*Подготовить/i,
    testInfo.project.name,
  );
  await activate(
    page,
    goalActions.getByRole('button', { name: /редактировать.*Подготовить/i }),
    testInfo.project.name,
  );
  const editGoalDialog = page.getByRole('dialog', { name: /редактировать цель/i });
  const goalField = editGoalDialog.getByLabel(/цель недели|формулировка/i);
  await expect(goalField).toHaveValue('Подготовить   обзор');
  await goalField.fill('  Подготовить   итоговый обзор  ');
  await activate(
    page,
    editGoalDialog.getByRole('button', { name: /сохранить/i }),
    testInfo.project.name,
  );
  await expect(goals.getByText('Подготовить   итоговый обзор', { exact: true })).toBeVisible();

  goalActions = await exposeItemActions(
    page,
    goals,
    /действия с целью.*Сверить план/i,
    testInfo.project.name,
  );
  await activate(
    page,
    goalActions.getByRole('button', { name: /переместить.*Сверить план.*вверх/i }),
    testInfo.project.name,
  );
  await expect(goals.getByRole('listitem')).toHaveText([
    /Сверить план/,
    /Подготовить {3}итоговый обзор/,
  ]);
  goalActions = await exposeItemActions(
    page,
    goals,
    /действия с целью.*Подготовить/i,
    testInfo.project.name,
  );
  await activate(
    page,
    goalActions.getByRole('button', { name: /удалить.*Подготовить/i }),
    testInfo.project.name,
  );
  await expect(goals.getByText('Подготовить   итоговый обзор')).toHaveCount(0);
  await expect(goals.locator('li > span').getByText('Сверить план', { exact: true })).toBeVisible();
  await expect(page.getByText(/прогресс цели|измеримост/i)).toHaveCount(0);

  const tuesday = weekPlannerDay(page, /вторник.*11 августа/i);
  const wednesday = weekPlannerDay(page, /среда.*12 августа/i);
  await addTask(page, tuesday, 'Подготовить заметки', 30, testInfo.project.name);
  await addTask(page, tuesday, 'Созвон с командой', 45, testInfo.project.name);
  await addTask(page, wednesday, 'Проверить макет', 20, testInfo.project.name);

  await exposeDetails(page, tuesday, testInfo.project.name);
  const tuesdayTasks = tuesday.getByRole('list', { name: /задачи/i });
  await expect(tuesdayTasks.getByRole('listitem')).toHaveText([
    /Подготовить заметки.*30 мин/,
    /Созвон с командой.*45 мин/,
  ]);
  const taskActions = await exposeItemActions(
    page,
    tuesdayTasks.getByRole('listitem').filter({ hasText: 'Созвон с командой' }),
    /действия с задачей.*Созвон с командой/i,
    testInfo.project.name,
  );
  await activate(
    page,
    taskActions.getByRole('button', { name: /переместить вверх/i }),
    testInfo.project.name,
  );
  await expect(tuesday.locator('[data-od-id="task-row"]')).toHaveText(
    [/Созвон с командой.*45 мин/, /Подготовить заметки.*30 мин/],
    { timeout: 15_000 },
  );
  await expect(tuesday.locator(':scope > summary')).toContainText(/2 задачи.*1 ч 15 мин/i);
  await expect(wednesday.locator(':scope > summary')).toContainText(/1 задача.*20 мин/i);
  await expect(page.getByText(/вместимость|перегруз|лимит нагрузки/i)).toHaveCount(0);

  await exposeDetails(page, tuesday, testInfo.project.name);
  await activate(
    page,
    tuesday.getByRole('link', { name: /открыть день|11 августа/i }),
    testInfo.project.name,
  );
  await expect(page).toHaveURL(new RegExp(`/day/${TUESDAY}$`));
  await expect(page.getByRole('heading', { level: 1, name: /день/i })).toBeVisible();
  const dayTasks = page.getByRole('list', { name: /задачи/i });
  await expect(dayTasks.getByRole('listitem')).toHaveText([
    /Созвон с командой.*45 мин/,
    /Подготовить заметки.*30 мин/,
  ]);
  const dayPlan = page.getByRole('region', { name: /план дня/i });
  await expect(dayPlan.getByRole('heading', { name: /плановая нагрузка/i })).toBeVisible();
  await expect(dayPlan.getByText('1 ч 15 мин', { exact: true })).toBeVisible();

  await page.reload();
  await expect(dayTasks.getByRole('listitem')).toHaveText([
    /Созвон с командой.*45 мин/,
    /Подготовить заметки.*30 мин/,
  ]);
  await expect(dayPlan.getByRole('heading', { name: /плановая нагрузка/i })).toBeVisible();
  await expect(dayPlan.getByText('1 ч 15 мин', { exact: true })).toBeVisible();

  await page.goto(`/week/${WEEK_START}`);
  await expect(page.locator('li > span').getByText('Сверить план', { exact: true })).toBeVisible();
  await expect(tuesday.locator(':scope > summary')).toContainText(/2 задачи.*1 ч 15 мин/i);
  await expect(page.getByRole('link', { name: /войти|регистрац|аккаунт/i })).toHaveCount(0);
});

/*
 * 003 US8 (FR-040, SC-010): all seven planner days in one interaction.
 */
test('expands and collapses the whole week planner with one control', async ({ page }) => {
  await page.goto(`/week/${WEEK_START}`);
  const days = page.locator('details[data-od-id="week-planner-day"]');
  await expect(days).toHaveCount(7);

  await page.getByRole('button', { name: 'Раскрыть все дни' }).click();
  await expect(days.filter({ has: page.locator(':scope[open]') })).toHaveCount(7);

  await page.getByRole('button', { name: 'Свернуть все дни' }).click();
  await expect(days.filter({ has: page.locator(':scope[open]') })).toHaveCount(0);
});
