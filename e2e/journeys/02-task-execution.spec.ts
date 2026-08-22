import { expect, test } from '../fixtures/orbit.fixture';
import { activate, exposeDetails, exposeItemActions, weekPlannerDay } from './journey-helpers';
import { mondayISO, plannerDayPattern, weekDayISO } from './dates';

const WEEK = mondayISO();
const TUESDAY = weekDayISO(1);
const WEDNESDAY = weekDayISO(2);

test('executes, moves, backlogs, and reschedules a task without ordinary cancellation', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto(`/week/${WEEK}`);
  const tuesday = weekPlannerDay(page, plannerDayPattern(TUESDAY));
  await exposeDetails(page, tuesday, testInfo.project.name);
  await activate(
    page,
    tuesday.getByRole('button', { name: /добавить задачу/i }),
    testInfo.project.name,
  );
  let dialog = page.getByRole('dialog', { name: /новая задача/i });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/название задачи/i).fill('Проверить отчёт');
  await dialog.getByLabel(/длительность/i).fill('30');
  await activate(page, dialog.getByRole('button', { name: /сохранить/i }), testInfo.project.name);
  await expect(dialog).toBeHidden();

  await exposeDetails(page, tuesday, testInfo.project.name);
  const taskItem = tuesday.getByRole('listitem').filter({ hasText: 'Проверить отчёт' });

  /* 003 US5: the row action opens a modal; the note survives reload and clears. */
  await activate(
    page,
    taskItem.getByRole('button', { name: /заметка к задаче/i }),
    testInfo.project.name,
  );
  let noteDialog = page.getByRole('dialog', { name: 'Заметка' });
  const noteField = noteDialog.getByRole('textbox', { name: /заметка к задаче/i });
  await noteField.fill('Уточнить цифры у бухгалтерии');
  await activate(
    page,
    noteDialog.getByRole('button', { name: 'Сохранить заметку' }),
    testInfo.project.name,
  );
  await expect(noteDialog).toBeHidden();

  await page.reload();
  await exposeDetails(page, tuesday, testInfo.project.name);
  const reloadedTask = tuesday.getByRole('listitem').filter({ hasText: 'Проверить отчёт' });
  await expect(reloadedTask.getByLabel('есть заметка')).toBeVisible();
  await activate(
    page,
    reloadedTask.getByRole('button', { name: /заметка к задаче/i }),
    testInfo.project.name,
  );
  noteDialog = page.getByRole('dialog', { name: 'Заметка' });
  await expect(noteDialog.getByRole('textbox', { name: /заметка к задаче/i })).toHaveValue(
    'Уточнить цифры у бухгалтерии',
  );

  await noteDialog.getByRole('textbox', { name: /заметка к задаче/i }).fill('');
  await activate(
    page,
    noteDialog.getByRole('button', { name: 'Сохранить заметку' }),
    testInfo.project.name,
  );
  await page.reload();
  await exposeDetails(page, tuesday, testInfo.project.name);
  await expect(
    tuesday.getByRole('listitem').filter({ hasText: 'Проверить отчёт' }).getByLabel('есть заметка'),
  ).toHaveCount(0);

  const checkbox = taskItem.getByRole('checkbox', { name: /выполнено/i });
  await checkbox.click();
  await expect(taskItem.getByRole('checkbox', { name: /выполнено/i })).toBeChecked();
  let taskActions = await exposeItemActions(
    page,
    taskItem,
    /действия с задачей.*Проверить отчёт/i,
    testInfo.project.name,
  );
  await expect(taskActions.getByRole('button', { name: /переместить на дату/i })).toBeDisabled();
  await expect(taskItem.getByText(/сначала снимите отметку/i)).toBeVisible();
  await activate(
    page,
    taskActions.getByRole('button', { name: /^редактировать$/i }),
    testInfo.project.name,
  );
  dialog = page.getByRole('dialog', { name: /редактировать задачу/i });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/название задачи/i).fill('Проверить итоговый отчёт');
  await activate(page, dialog.getByRole('button', { name: /сохранить/i }), testInfo.project.name);
  await expect(dialog).toBeHidden();

  await exposeDetails(page, tuesday, testInfo.project.name);
  const edited = tuesday.getByRole('listitem').filter({ hasText: 'Проверить итоговый отчёт' });
  await edited.getByRole('checkbox', { name: /выполнено/i }).click();
  await expect(edited.getByRole('checkbox', { name: /выполнено/i })).not.toBeChecked();
  taskActions = await exposeItemActions(
    page,
    edited,
    /действия с задачей.*Проверить итоговый отчёт/i,
    testInfo.project.name,
  );
  await activate(
    page,
    taskActions.getByRole('button', { name: /переместить на дату/i }),
    testInfo.project.name,
  );
  dialog = page.getByRole('dialog', { name: /переместить задачу/i });
  await expect(dialog.getByRole('option', { name: TUESDAY })).toHaveCount(0);
  await dialog.getByLabel(/дата назначения/i).selectOption(WEDNESDAY);
  await dialog.getByLabel(/длительность/i).fill('0');
  await activate(
    page,
    dialog.getByRole('button', { name: /^переместить$/i }),
    testInfo.project.name,
  );
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(dialog.getByLabel(/дата назначения/i)).toHaveValue(WEDNESDAY);
  await dialog.getByLabel(/длительность/i).fill('30');
  await activate(
    page,
    dialog.getByRole('button', { name: /^переместить$/i }),
    testInfo.project.name,
  );

  const wednesday = weekPlannerDay(page, plannerDayPattern(WEDNESDAY));
  await exposeDetails(page, wednesday, testInfo.project.name);
  const moved = wednesday.getByRole('listitem').filter({ hasText: 'Проверить итоговый отчёт' });
  await expect(moved).toBeVisible();
  taskActions = await exposeItemActions(
    page,
    moved,
    /действия с задачей.*Проверить итоговый отчёт/i,
    testInfo.project.name,
  );
  await activate(
    page,
    taskActions.getByRole('button', { name: /в бэклог/i }),
    testInfo.project.name,
  );
  await activate(page, page.getByRole('link', { name: /^бэклог$/i }), testInfo.project.name);
  const backlogItem = page.getByRole('listitem').filter({ hasText: 'Проверить итоговый отчёт' });
  await expect(backlogItem).toBeVisible();
  await expect(backlogItem.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /сортировать|фильтр|отменить/i })).toHaveCount(0);

  await activate(
    page,
    backlogItem.getByRole('button', { name: /запланировать/i }),
    testInfo.project.name,
  );
  dialog = page.getByRole('dialog', { name: /переместить задачу/i });
  await dialog.getByLabel(/дата назначения/i).selectOption(TUESDAY);
  await dialog.getByLabel(/длительность/i).fill('30');
  await activate(
    page,
    dialog.getByRole('button', { name: /^переместить$/i }),
    testInfo.project.name,
  );
  await expect(dialog).toBeHidden();
  await page.goto(`/day/${TUESDAY}`);
  await expect(
    page.locator('[data-od-id="day-tasks"]').getByText('Проверить итоговый отчёт', {
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator('[data-od-id="day-tasks"]').getByText('Проверить итоговый отчёт', {
      exact: true,
    }),
  ).toBeVisible();
});

test('preserves a closed membership after mixed deletion and exposes no finalized mutation', async ({
  page,
  orbitDatabase,
}, testInfo) => {
  const unavailableScore = {
    task: { completed: 0, applicable: 0, rate: 'unavailable' },
    habit: { completed: 0, applicable: 0, rate: 'unavailable' },
    value: 'unavailable',
  };
  const occurrenceId = '123e4567-e89b-42d3-a456-426614174101';
  await orbitDatabase.seed({
    version: 1,
    stores: {
      weeks: [{ status: 'open', startDate: WEEK, goals: [], revision: 0 }],
      days: [
        {
          status: 'closed',
          date: TUESDAY,
          weekStart: WEEK,
          revision: 1,
          closureSnapshot: { score: unavailableScore, plannedLoadMinutes: 30 },
          closedAt: `${TUESDAY}T18:00:00.000Z`,
        },
        {
          status: 'open',
          date: WEDNESDAY,
          weekStart: WEEK,
          revision: 0,
        },
      ],
      taskOccurrences: [
        {
          id: occurrenceId,
          title: 'Сохранить закрытый факт',
          state: 'active',
          placement: { kind: 'day', date: WEDNESDAY },
          placementKey: `day:${WEDNESDAY}`,
          plannedDurationMinutes: 30,
          dayPosition: 0,
          completion: 'incomplete',
          isException: false,
          createdSequence: 1,
          revision: 0,
        },
      ],
      taskPlanEntries: [
        {
          id: '123e4567-e89b-42d3-a456-426614175101',
          occurrenceId,
          date: TUESDAY,
          weekStart: WEEK,
          plannedSnapshot: { title: 'Сохранить закрытый факт', plannedDurationMinutes: 30 },
          enteredAt: `${TUESDAY}T08:00:00.000Z`,
          finalizedAt: `${TUESDAY}T18:00:00.000Z`,
          outcome: 'kept-unfinished',
        },
        {
          id: '123e4567-e89b-42d3-a456-426614175102',
          occurrenceId,
          date: WEDNESDAY,
          weekStart: WEEK,
          plannedSnapshot: { title: 'Сохранить закрытый факт', plannedDurationMinutes: 30 },
          enteredAt: `${WEDNESDAY}T08:00:00.000Z`,
          outcome: 'planned',
        },
      ],
    },
  });
  await page.reload();

  await page.goto(`/day/${WEDNESDAY}`);
  const liveTask = page.getByRole('listitem').filter({ hasText: 'Сохранить закрытый факт' });
  await expect(liveTask).toBeVisible();
  const taskActions = await exposeItemActions(
    page,
    liveTask,
    /действия с задачей.*Сохранить закрытый факт/i,
    testInfo.project.name,
  );
  await activate(
    page,
    taskActions.getByRole('button', { name: /^удалить$/i }),
    testInfo.project.name,
  );
  await expect(liveTask).toHaveCount(0);

  await page.goto(`/day/${TUESDAY}`);
  const historicalTask = page.getByRole('listitem').filter({ hasText: 'Сохранить закрытый факт' });
  await expect(historicalTask).toBeVisible();
  await expect(historicalTask.getByRole('checkbox')).toHaveCount(0);
  await expect(historicalTask.getByLabel(/действия с задачей/i)).toHaveCount(0);
  await expect(
    historicalTask.getByRole('button', { name: /редактировать|удалить|переместить|бэклог/i }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: /добавить задачу/i })).toBeDisabled();
});
