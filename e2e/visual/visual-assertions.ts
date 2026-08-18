import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

const BASELINE_APPROVAL_TOKEN = 'remediated-review-complete';

interface Box {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function box(locator: Locator): Promise<Box> {
  await expect(locator).toBeVisible();
  const bounds = await locator.boundingBox();
  expect(
    bounds,
    `Expected ${await locator.evaluate((node) => node.outerHTML.slice(0, 160))} to have layout bounds`,
  ).not.toBeNull();
  if (bounds === null) throw new Error('Visible visual region did not have layout bounds');
  return bounds;
}

export function region(page: Page, id: string): Locator {
  return page.locator(`[data-od-id="${id}"]`);
}

/**
 * Refuses Playwright's normal first-run golden creation unless remediation has
 * already been reviewed and the caller supplies the deliberate approval token.
 */
export async function expectApprovedScreenshot(
  page: Page,
  name: string,
  testInfo: TestInfo,
): Promise<void> {
  const baselinePath = testInfo.snapshotPath(name);
  const baselineExists = await exists(baselinePath);
  const updateApproved = process.env.ORBIT_VISUAL_BASELINE_APPROVAL === BASELINE_APPROVAL_TOKEN;
  const replacementRequested =
    testInfo.config.updateSnapshots === 'all' || testInfo.config.updateSnapshots === 'changed';

  expect(
    !replacementRequested || updateApproved,
    [
      `Visual baseline replacement was requested for: ${baselinePath}`,
      'Reviewed baselines may only be changed after a fresh reference comparison.',
      `Set ORBIT_VISUAL_BASELINE_APPROVAL=${BASELINE_APPROVAL_TOKEN} only for that reviewed run.`,
    ].join('\n'),
  ).toBe(true);

  // A missing golden still produces a review candidate in ignored test output.
  // This lets reviewers inspect the remediated render without accepting it as
  // the baseline or weakening the explicit approval guard below.
  if (!baselineExists && !updateApproved) {
    const candidateRoot = process.env.ORBIT_VISUAL_CANDIDATE_DIR;
    await page.screenshot({
      path:
        candidateRoot === undefined
          ? testInfo.outputPath(`candidate-${name}`)
          : join(candidateRoot, name),
      animations: 'disabled',
      caret: 'hide',
      fullPage: true,
      scale: 'css',
    });
  }

  expect(
    baselineExists || updateApproved,
    [
      `Approved visual baseline is missing: ${baselinePath}`,
      'The current implementation must not become the baseline.',
      'After structural checks and design review pass, run Playwright with',
      `ORBIT_VISUAL_BASELINE_APPROVAL=${BASELINE_APPROVAL_TOKEN} and --update-snapshots.`,
    ].join('\n'),
  ).toBe(true);

  await expect(page).toHaveScreenshot(name, {
    animations: 'disabled',
    caret: 'hide',
    fullPage: true,
    scale: 'css',
  });
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const offenders = [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className:
            typeof element.className === 'string'
              ? element.className.slice(0, 100)
              : element.tagName.toLowerCase(),
          dataOdId: element.dataset.odId,
          left: Math.round(bounds.left),
          right: Math.round(bounds.right),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        };
      })
      .filter(
        (item) =>
          item.right > root.clientWidth + 1 ||
          item.left < -1 ||
          item.scrollWidth > item.clientWidth + 1,
      )
      .slice(0, 12);
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      offenders,
    };
  });
  expect(
    overflow.scrollWidth,
    `Horizontal overflow diagnostics: ${JSON.stringify(overflow)}`,
  ).toBeLessThanOrEqual(overflow.clientWidth);
}

export async function expectDesktopShell(page: Page): Promise<void> {
  const shell = region(page, 'app-shell');
  const rail = region(page, 'app-rail');
  const content = region(page, 'app-content');

  const [shellBox, railBox, contentBox] = await Promise.all([box(shell), box(rail), box(content)]);

  expect(railBox.x).toBeCloseTo(0, 0);
  expect(railBox.y).toBeCloseTo(0, 0);
  expect(railBox.width).toBeCloseTo(220, 0);
  expect(railBox.height).toBeGreaterThanOrEqual(900);
  expect(contentBox.x).toBeGreaterThanOrEqual(220);
  expect(contentBox.y).toBeLessThanOrEqual(2);
  expect(shellBox.width).toBeCloseTo(1440, 0);
  /*
   * REPLACED DEVICE-LOCAL STORAGE ASSERTION (recorded in traceability.md).
   *
   * 001 asserted the storage disclosure sat inside the rail and within its
   * bounds. 002 FR-015 removes that disclosure, so what is checked now is its
   * absence. Every other shell invariant is unchanged, and the committed
   * screenshots still match — the element was the last item in the rail, below
   * the navigation, so removing it moved nothing else.
   */
  await expect(region(page, 'persistence-status')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
}

export async function expectDesktopDayComposition(page: Page): Promise<void> {
  await expect(region(page, 'day-header')).toBeVisible();
  await expect(region(page, 'close-day')).toBeVisible();
  const [layout, load, tasks, score, habits, state] = await Promise.all([
    box(region(page, 'day-layout')),
    box(region(page, 'day-load')),
    box(region(page, 'day-tasks')),
    box(region(page, 'day-score')),
    box(region(page, 'day-habits')),
    box(region(page, 'day-state')),
  ]);

  expect(layout.width).toBeGreaterThan(900);
  expect(load.x).toBeCloseTo(tasks.x, 0);
  expect(load.width).toBeGreaterThan(score.width);
  expect(score.x).toBeGreaterThan(load.x + load.width);
  expect(Math.abs(score.y - load.y)).toBeLessThanOrEqual(24);
  expect(habits.x).toBeCloseTo(score.x, 0);
  expect(state.x).toBeCloseTo(score.x, 0);
  expect(tasks.y).toBeGreaterThan(load.y);
  await expectNoHorizontalOverflow(page);
}

export async function expectDesktopWeekComposition(page: Page): Promise<void> {
  await expect(region(page, 'week-header')).toBeVisible();
  const [layout, progress, dailyResults, summary, habits, goals] = await Promise.all([
    box(region(page, 'week-layout')),
    box(region(page, 'week-progress')),
    box(region(page, 'week-daily-results')),
    box(region(page, 'week-summary')),
    box(region(page, 'week-habits')),
    box(region(page, 'week-goals')),
  ]);

  expect(layout.width).toBeGreaterThan(900);
  expect(progress.width).toBeGreaterThan(dailyResults.width);
  expect(progress.x).toBeLessThan(dailyResults.x);
  expect(Math.abs(progress.y - dailyResults.y)).toBeLessThanOrEqual(24);
  expect(summary.x).toBeCloseTo(progress.x, 0);
  expect(summary.y).toBeGreaterThan(progress.y);
  expect(habits.x).toBeCloseTo(dailyResults.x, 0);
  expect(goals.y).toBeGreaterThan(dailyResults.y);
  await expectNoHorizontalOverflow(page);
}

export async function expectDesktopHistoryComposition(page: Page): Promise<void> {
  await expect(region(page, 'history-header')).toBeVisible();
  const [layout, calendar, selectedDay, dynamics] = await Promise.all([
    box(region(page, 'history-layout')),
    box(region(page, 'history-calendar')),
    box(region(page, 'history-selected-day')),
    box(region(page, 'history-dynamics')),
  ]);

  expect(layout.width).toBeGreaterThan(900);
  expect(calendar.x).toBeLessThan(selectedDay.x);
  // The approved History composition gives the selected-day review more
  // horizontal weight than the calendar (0.86fr / 1.14fr).
  expect(calendar.width).toBeLessThan(selectedDay.width);
  expect(Math.abs(calendar.y - selectedDay.y)).toBeLessThanOrEqual(24);
  expect(dynamics.y).toBeGreaterThan(
    Math.max(calendar.y + calendar.height, selectedDay.y + selectedDay.height),
  );
  await expectNoHorizontalOverflow(page);
}

export async function expectTabletShell(page: Page): Promise<void> {
  const railBox = await box(region(page, 'app-rail'));
  const contentBox = await box(region(page, 'app-content'));
  expect(railBox.width).toBeCloseTo(88, 0);
  expect(contentBox.x).toBeGreaterThanOrEqual(88);
  expect(contentBox.y).toBeLessThanOrEqual(2);
  await expectNoHorizontalOverflow(page);
}

export async function expectMobileShell(page: Page): Promise<void> {
  const contentBox = await box(region(page, 'app-content'));
  const railBox = await box(region(page, 'app-rail'));
  const mobileNavBox = await box(region(page, 'mobile-navigation'));

  expect(contentBox.x).toBeGreaterThanOrEqual(0);
  expect(contentBox.width).toBeLessThanOrEqual(390);
  expect(railBox.x).toBeGreaterThanOrEqual(12);
  expect(railBox.x + railBox.width).toBeLessThanOrEqual(378);
  expect(railBox.y).toBeGreaterThan(700);
  expect(mobileNavBox.x).toBeGreaterThanOrEqual(12);
  expect(mobileNavBox.x + mobileNavBox.width).toBeLessThanOrEqual(378);
  expect(mobileNavBox.y + mobileNavBox.height).toBeLessThanOrEqual(832);
  await expectNoHorizontalOverflow(page);
}

export async function expectResponsiveSingleColumn(
  page: Page,
  ids: readonly string[],
): Promise<void> {
  const boxes = await Promise.all(ids.map(async (id) => box(region(page, id))));
  const first = boxes[0];
  if (first === undefined) throw new Error('At least one responsive region is required');
  for (const current of boxes.slice(1)) {
    expect(Math.abs(current.x - first.x)).toBeLessThanOrEqual(8);
  }
}
