import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

export type JourneyProjectName = TestInfo['project']['name'];

export async function activate(
  page: Page,
  control: Locator,
  project: JourneyProjectName,
): Promise<void> {
  await expect(control).toBeVisible();
  await expect(control).toBeEnabled();
  if (project === 'desktop-chromium-keyboard') {
    await control.focus();
    await expect(control).toBeFocused();
    await page.keyboard.press('Enter');
    return;
  }
  await control.tap();
}

export function weekPlannerDay(page: Page, label: RegExp): Locator {
  return page
    .locator('[data-od-id="week-planner"] details[data-od-id="week-planner-day"]')
    .filter({ hasText: label });
}

export async function exposeDetails(
  page: Page,
  details: Locator,
  project: JourneyProjectName,
): Promise<void> {
  if ((await details.getAttribute('open')) === null) {
    await activate(page, details.locator(':scope > summary'), project);
  }
  await expect(details).toHaveAttribute('open', '');
}

export async function closeOpenDetails(
  page: Page,
  container: Locator,
  project: JourneyProjectName,
): Promise<void> {
  const openDetails = container.locator('details[open]');
  while ((await openDetails.count()) > 0) {
    const details = openDetails.first();
    await activate(page, details.locator(':scope > summary'), project);
    await expect(details).not.toHaveAttribute('open', '');
  }
}

export async function exposeItemActions(
  page: Page,
  item: Locator,
  summaryName: RegExp,
  project: JourneyProjectName,
): Promise<Locator> {
  const summary = item.getByLabel(summaryName);
  const details = summary.locator('..');
  await exposeDetails(page, details, project);
  return details;
}
