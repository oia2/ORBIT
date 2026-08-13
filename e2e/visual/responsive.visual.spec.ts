import { openVisualPage, test, type VisualScenario } from '../fixtures/visual.fixture';
import {
  expectApprovedScreenshot,
  expectMobileShell,
  expectResponsiveSingleColumn,
  expectTabletShell,
} from './visual-assertions';

interface ResponsiveCapture {
  readonly height: number;
  readonly name: string;
  readonly path: string;
  readonly scenario: VisualScenario;
  readonly width: 820 | 390;
}

const RESPONSIVE_CAPTURES: readonly ResponsiveCapture[] = [
  {
    height: 1180,
    name: 'tablet-day-populated.png',
    path: '/day/2026-05-20',
    scenario: 'populated',
    width: 820,
  },
  {
    height: 1180,
    name: 'tablet-week-populated.png',
    path: '/week/2026-05-18',
    scenario: 'populated',
    width: 820,
  },
  {
    height: 1180,
    name: 'tablet-history-month-populated.png',
    path: '/history',
    scenario: 'populated',
    width: 820,
  },
  {
    height: 844,
    name: 'mobile-day-populated.png',
    path: '/day/2026-05-20',
    scenario: 'populated',
    width: 390,
  },
  {
    height: 844,
    name: 'mobile-week-populated.png',
    path: '/week/2026-05-18',
    scenario: 'populated',
    width: 390,
  },
  {
    height: 844,
    name: 'mobile-history-month-populated.png',
    path: '/history',
    scenario: 'populated',
    width: 390,
  },
];

test.describe('ORBIT responsive visual conformance', () => {
  for (const capture of RESPONSIVE_CAPTURES) {
    test(`${capture.name} has an approved remediated baseline`, async ({
      orbitDatabase,
      page,
    }, testInfo) => {
      await page.setViewportSize({ height: capture.height, width: capture.width });
      await openVisualPage(page, orbitDatabase, capture.scenario, capture.path);
      await expectApprovedScreenshot(page, capture.name, testInfo);
    });
  }

  test('uses the compact rail and one-column page hierarchy at 820px', async ({
    orbitDatabase,
    page,
  }) => {
    await page.setViewportSize({ height: 1180, width: 820 });

    await openVisualPage(page, orbitDatabase, 'populated', '/day/2026-05-20');
    await expectTabletShell(page);
    await expectResponsiveSingleColumn(page, ['day-load', 'day-tasks', 'day-score']);

    await openVisualPage(page, orbitDatabase, 'populated', '/week/2026-05-18');
    await expectTabletShell(page);
    await expectResponsiveSingleColumn(page, ['week-progress', 'week-daily-results']);

    await openVisualPage(page, orbitDatabase, 'populated', '/history');
    await expectTabletShell(page);
    await expectResponsiveSingleColumn(page, ['history-calendar', 'history-selected-day']);
  });

  test('uses bottom navigation and one-column page hierarchy at 390px', async ({
    orbitDatabase,
    page,
  }) => {
    await page.setViewportSize({ height: 844, width: 390 });

    await openVisualPage(page, orbitDatabase, 'populated', '/day/2026-05-20');
    await expectMobileShell(page);
    await expectResponsiveSingleColumn(page, [
      'day-load',
      'day-tasks',
      'day-score',
      'day-habits',
      'day-state',
    ]);

    await openVisualPage(page, orbitDatabase, 'populated', '/week/2026-05-18');
    await expectMobileShell(page);
    await expectResponsiveSingleColumn(page, [
      'week-progress',
      'week-summary',
      'week-daily-results',
      'week-habits',
      'week-goals',
    ]);

    await openVisualPage(page, orbitDatabase, 'populated', '/history');
    await expectMobileShell(page);
    await expectResponsiveSingleColumn(page, [
      'history-calendar',
      'history-selected-day',
      'history-dynamics',
    ]);
  });
});
