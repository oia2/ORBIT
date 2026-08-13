import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createIndexedDbPlanningRepository } from '@/entities/planning';
import { createSystemClock } from '@/shared/lib/local-date/clock';

import { AppProviders } from './app/providers/AppProviders';
import { AppRouter } from './app/routes/AppRouter';
import { createAppRuntime } from './app/runtime/create-app-runtime';
import './app/styles/global.css';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('ORBIT root element is missing');
}

const clock = createSystemClock();
type PlanningDatabase = Parameters<typeof createIndexedDbPlanningRepository>[0];
const runtime = createAppRuntime<PlanningDatabase>({
  createRepository: (database) => createIndexedDbPlanningRepository(database, { clock }),
});

if (import.meta.hot !== undefined) {
  import.meta.hot.dispose(() => {
    runtime.dispose();
  });
}

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders runtime={runtime} clock={clock}>
      <AppRouter clock={clock} />
    </AppProviders>
  </StrictMode>,
);
