import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router';

import { NotFoundPage } from '@/pages/not-found';
import { BacklogPage } from '@/pages/backlog';
import { WeekPage } from '@/pages/week';
import { DayPage } from '@/pages/day';
import { HistoryPage } from '@/pages/history';
import { createSystemClock, type ApplicationClock } from '@/shared/lib/local-date/clock';

import { AppShell } from '../layout/AppShell';
import {
  BACKLOG_PATH,
  buildWeekPath,
  canonicalWeekStart,
  HISTORY_PATH,
  parseDayRouteDate,
  ROOT_PATH,
} from './paths';

export interface AppRouterProps {
  readonly clock?: ApplicationClock;
}

function WeekRoute({
  currentWeekPath,
  clock,
}: {
  readonly currentWeekPath: string;
  readonly clock: ApplicationClock;
}) {
  const { weekStart = '' } = useParams();
  const canonical = canonicalWeekStart(weekStart);
  if (canonical === undefined) {
    return <NotFoundPage currentWeekPath={currentWeekPath} />;
  }
  const canonicalPath = buildWeekPath(canonical);
  if (canonicalPath !== `/week/${weekStart}`) {
    return <Navigate replace to={canonicalPath} />;
  }

  return <WeekPage weekStart={canonical} clock={clock} />;
}

function DayRoute({
  currentWeekPath,
  clock,
}: {
  readonly currentWeekPath: string;
  readonly clock: ApplicationClock;
}) {
  const { date = '' } = useParams();
  const parsedDate = parseDayRouteDate(date);
  return parsedDate === undefined ? (
    <NotFoundPage currentWeekPath={currentWeekPath} />
  ) : (
    <DayPage date={parsedDate} clock={clock} />
  );
}

export function AppRouter({ clock = createSystemClock() }: AppRouterProps) {
  const currentDate = clock.currentLocalDate();
  const currentWeekPath = buildWeekPath(currentDate);

  return (
    <BrowserRouter>
      <AppShell currentDate={currentDate}>
        <Routes>
          <Route path={ROOT_PATH} element={<Navigate replace to={currentWeekPath} />} />
          <Route
            path="/week/:weekStart"
            element={<WeekRoute currentWeekPath={currentWeekPath} clock={clock} />}
          />
          <Route
            path="/day/:date"
            element={<DayRoute currentWeekPath={currentWeekPath} clock={clock} />}
          />
          <Route path={BACKLOG_PATH} element={<BacklogPage currentDate={currentDate} />} />
          <Route path={HISTORY_PATH} element={<HistoryPage clock={clock} />} />
          <Route path="*" element={<NotFoundPage currentWeekPath={currentWeekPath} />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
