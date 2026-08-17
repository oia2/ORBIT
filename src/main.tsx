import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { createHttpPlanningRepository } from '@/entities/planning';
import { createSystemClock } from '@/shared/lib/local-date/clock';

import { AppProviders } from './app/providers/AppProviders';
import { AppRouter } from './app/routes/AppRouter';
import { createAppRuntime, createHealthProbe } from './app/runtime/create-app-runtime';
import './app/styles/global.css';

const rootElement = document.getElementById('root');

if (rootElement === null) {
  throw new Error('ORBIT root element is missing');
}

// The browser owns the clock and sends its whole reading with every request;
// the server rebuilds feature 001's clock from it and has none of its own.
const clock = createSystemClock();
const runtime = createAppRuntime({
  probeHealth: createHealthProbe(),
  createRepository: () => createHttpPlanningRepository({ clock }),
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
