import { openVisualPage, test, type VisualScenario } from '../fixtures/visual.fixture';
import {
  expectApprovedScreenshot,
  expectDesktopDayComposition,
  expectDesktopHistoryComposition,
  expectDesktopShell,
  expectDesktopWeekComposition,
} from './visual-assertions';

interface DesktopCapture {
  readonly name: string;
  readonly path: string;
  readonly scenario: VisualScenario;
}

const DESKTOP_CAPTURES: readonly DesktopCapture[] = [
  {
    name: 'desktop-shared-shell.png',
    path: '/week/2026-05-18',
    scenario: 'populated',
  },
  {
    name: 'desktop-day-populated.png',
    path: '/day/2026-05-20',
    scenario: 'populated',
  },
  {
    name: 'desktop-day-empty.png',
    path: '/day/2026-05-20',
    scenario: 'empty',
  },
  {
    name: 'desktop-week-populated.png',
    path: '/week/2026-05-18',
    scenario: 'populated',
  },
  {
    name: 'desktop-week-empty.png',
    path: '/week/2026-05-18',
    scenario: 'empty',
  },
  {
    name: 'desktop-history-month-populated.png',
    path: '/history',
    scenario: 'populated',
  },
  {
    name: 'desktop-history-month-empty.png',
    path: '/history',
    scenario: 'empty',
  },
];

test.describe('ORBIT desktop visual conformance at 1440x900', () => {
  test.use({ viewport: { height: 900, width: 1440 } });

  for (const capture of DESKTOP_CAPTURES) {
    test(`${capture.name} has an approved remediated baseline`, async ({
      orbitDatabase,
      page,
    }, testInfo) => {
      await openVisualPage(page, orbitDatabase, capture.scenario, capture.path);
      await expectApprovedScreenshot(page, capture.name, testInfo);
    });
  }

  test('preserves the desktop shell and page-composition invariants', async ({
    orbitDatabase,
    page,
  }) => {
    await openVisualPage(page, orbitDatabase, 'populated', '/day/2026-05-20');
    await expectDesktopShell(page);
    await expectDesktopDayComposition(page);

    await openVisualPage(page, orbitDatabase, 'populated', '/week/2026-05-18');
    await expectDesktopShell(page);
    await expectDesktopWeekComposition(page);

    await openVisualPage(page, orbitDatabase, 'populated', '/history');
    await expectDesktopShell(page);
    await expectDesktopHistoryComposition(page);
  });
});
