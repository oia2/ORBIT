import type { Page, TestInfo } from '@playwright/test';

import { expect, test } from '../fixtures/orbit.fixture';
import { activate } from './journey-helpers';

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
  await page.goto('/day/2026-08-13');
  for (const title of ['Оставить', 'На дату', 'В бэклог', 'Отменить'])
    await addTask(page, title, testInfo.project.name);
  await activate(
    page,
    page.getByRole('button', { name: 'Добавить привычку' }),
    testInfo.project.name,
  );
  let dialog = page.getByRole('dialog', { name: /новая привычка/i });
  await dialog.getByLabel(/название привычки/i).fill('Прогулка');
  await dialog.getByLabel(/дата начала/i).fill('2026-08-13');
  await dialog.getByLabel(/четверг/i).check();
  await activate(page, dialog.getByRole('button', { name: /сохранить/i }), testInfo.project.name);
  await expect(dialog).toBeHidden();
  await activate(page, page.getByRole('button', { name: 'Закрыть день' }), testInfo.project.name);
  dialog = page.getByRole('dialog', { name: /закрыть день/i });
  await expect(dialog.getByRole('alert')).toContainText(/отметьте.*привычки/i);
  await activate(page, dialog.getByRole('button', { name: /вернуться/i }), testInfo.project.name);
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Прогулка' })
    .getByRole('button', { name: /^выполнено$/i })
    .click();
  const completedHabit = page.getByRole('listitem').filter({ hasText: 'Прогулка' });
  await expect(completedHabit).toContainText(/выполнено/i);
  await expect(completedHabit.getByRole('button', { name: /^выполнено$/i })).toHaveCount(0);
  await activate(page, page.getByRole('button', { name: 'Закрыть день' }), testInfo.project.name);
  dialog = page.getByRole('dialog', { name: /закрыть день/i });
  await dialog.getByLabel(/^Действие для Оставить/i).selectOption('keep-unfinished');
  await dialog.getByLabel(/^Действие для На дату/i).selectOption('move-to-date');
  await dialog.getByLabel(/дата переноса/i).selectOption('2026-08-14');
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
  await expect(page.getByText(/день закрыт.*повторное открытие недоступно/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /^закрыть день$/i })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/день закрыт.*повторное открытие недоступно/i)).toBeVisible();

  await page.goto('/day/2026-08-12');
  await expect(page.getByRole('button', { name: /^закрыть день$/i })).toBeVisible();
  await page.goto('/day/2026-08-14');
  await expect(page.getByText(/будущий день пока нельзя закрыть/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /^закрыть день$/i })).toHaveCount(0);
});
