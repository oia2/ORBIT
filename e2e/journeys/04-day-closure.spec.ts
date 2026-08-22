import type { Page, TestInfo } from '@playwright/test';

import { expect, test } from '../fixtures/orbit.fixture';
import { activate } from './journey-helpers';

/**
 * A habit's effective start is the current local date, so the pending-habit gate
 * can only be exercised on today. The journey therefore derives its dates at
 * runtime instead of pinning a calendar day.
 */
const WEEKDAY_LABELS = [
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
  'воскресенье',
] as const;

function todayLocalISO(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}

function shiftedLocalISO(days: number): string {
  const shifted = new Date();
  shifted.setDate(shifted.getDate() + days);
  const month = String(shifted.getMonth() + 1).padStart(2, '0');
  const day = String(shifted.getDate()).padStart(2, '0');
  return `${String(shifted.getFullYear())}-${month}-${day}`;
}

function todayWeekdayLabel(): string {
  const isoWeekday = ((new Date().getDay() + 6) % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  return WEEKDAY_LABELS[isoWeekday];
}

async function addTask(page: Page, title: string, project: TestInfo['project']['name']) {
  await activate(page, page.getByRole('button', { name: /добавить задачу/i }), project);
  const dialog = page.getByRole('dialog', { name: /новая задача/i });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(/название задачи/i).fill(title);
  await dialog.getByLabel(/длительность/i).fill('20');
  await activate(page, dialog.getByRole('button', { name: /сохранить/i }), project);
  await expect(dialog).toBeHidden();
}

test('closes an eligible day atomically with an explicit disposition for every task', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.goto(`/day/${todayLocalISO()}`);
  for (const title of ['Оставить', 'На дату', 'В бэклог', 'Отменить'])
    await addTask(page, title, testInfo.project.name);
  await activate(
    page,
    page.getByRole('button', { name: 'Добавить привычку' }),
    testInfo.project.name,
  );
  let dialog = page.getByRole('dialog', { name: /новая привычка/i });
  await dialog.getByLabel(/название привычки/i).fill('Прогулка');
  await dialog.getByLabel(new RegExp(todayWeekdayLabel(), 'i')).check();
  await activate(page, dialog.getByRole('button', { name: /сохранить/i }), testInfo.project.name);
  await expect(dialog).toBeHidden();
  await activate(page, page.getByRole('button', { name: 'Закрыть день' }), testInfo.project.name);
  dialog = page.getByRole('dialog', { name: /закрыть день/i });
  await expect(dialog.getByRole('alert')).toContainText(/отметьте.*привычки/i);
  await activate(page, dialog.getByRole('button', { name: /вернуться/i }), testInfo.project.name);
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Прогулка' })
    .getByRole('button', { name: /отметить .*выполненной/i })
    .click();
  const completedHabit = page.getByRole('listitem').filter({ hasText: 'Прогулка' });
  await expect(completedHabit).toContainText(/выполнено/i);
  await expect(completedHabit.getByRole('button', { name: /отметить .*выполненной/i })).toHaveCount(
    0,
  );
  await activate(page, page.getByRole('button', { name: 'Закрыть день' }), testInfo.project.name);
  dialog = page.getByRole('dialog', { name: /закрыть день/i });
  await dialog.getByLabel(/^Действие для Оставить/i).selectOption('keep-unfinished');
  await dialog.getByLabel(/^Действие для На дату/i).selectOption('move-to-date');
  await dialog.getByLabel(/дата переноса/i).selectOption({ index: 1 });
  await dialog.getByLabel(/длительность/i).fill('0');
  await dialog.getByLabel(/^Действие для В бэклог/i).selectOption('move-to-backlog');
  await dialog.getByLabel(/^Действие для Отменить/i).selectOption('cancel');
  await activate(
    page,
    dialog.getByRole('button', { name: /^закрыть день$/i }),
    testInfo.project.name,
  );
  await expect(dialog.getByRole('alert')).toContainText(/больше нуля/i);
  await expect(page.getByRole('list', { name: /задачи/i }).getByRole('listitem')).toHaveCount(4);
  await dialog.getByLabel(/длительность/i).fill('20');
  await activate(
    page,
    dialog.getByRole('button', { name: /^закрыть день$/i }),
    testInfo.project.name,
  );
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/результат и плановая нагрузка зафиксированы/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /^закрыть день$/i })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/результат и плановая нагрузка зафиксированы/i)).toBeVisible();

  /*
   * 003 US3: a closed day is no longer a dead end. Reopen it, confirm it is
   * genuinely editable again and survives a reload, then close it a second
   * time — the round trip is the whole point of the story.
   */
  await activate(
    page,
    page.getByRole('button', { name: 'Открыть день заново' }),
    testInfo.project.name,
  );
  const reopenDialog = page.getByRole('dialog', { name: /открыть день заново/i });
  // D1: the owner is told what reopening will not claw back before committing.
  await expect(reopenDialog).toContainText(/останутся там же/i);
  await activate(
    page,
    reopenDialog.getByRole('button', { name: /^открыть день$/i }),
    testInfo.project.name,
  );
  await expect(reopenDialog).toBeHidden();

  await expect(page.getByRole('button', { name: /^закрыть день$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Открыть день заново' })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: /^закрыть день$/i })).toBeVisible();
  await expect(page.getByText(/результат и плановая нагрузка зафиксированы/i)).toHaveCount(0);

  // Correct one restored outcome, then explicitly dispose the other restored
  // unfinished task. Reopening makes both live again; closure never guesses.
  const restoredKeptTask = page
    .getByRole('listitem')
    .filter({ hasText: 'Оставить' })
    .getByRole('checkbox', { name: /выполнено/i });
  await restoredKeptTask.click();
  await expect(restoredKeptTask).toBeChecked();
  await activate(page, page.getByRole('button', { name: 'Закрыть день' }), testInfo.project.name);
  const secondClosure = page.getByRole('dialog', { name: /закрыть день/i });
  await secondClosure.getByLabel(/^Действие для Отменить/i).selectOption('cancel');
  await activate(
    page,
    secondClosure.getByRole('button', { name: /^закрыть день$/i }),
    testInfo.project.name,
  );
  await expect(secondClosure).toBeHidden();
  await expect(page.getByText(/результат и плановая нагрузка зафиксированы/i)).toBeVisible();

  await page.goto(`/day/${shiftedLocalISO(-1)}`);
  await expect(page.getByRole('button', { name: /^закрыть день$/i })).toBeVisible();
  await page.goto(`/day/${shiftedLocalISO(1)}`);
  await expect(page.getByText(/будущий день пока нельзя закрыть/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /^закрыть день$/i })).toHaveCount(0);
});
