import { createContext, useContext, type ReactNode } from 'react';

import type { PlanningRepository } from '../model/planning-repository';

const PlanningRepositoryContext = createContext<PlanningRepository | undefined>(undefined);
PlanningRepositoryContext.displayName = 'PlanningRepository';

export interface PlanningRepositoryProviderProps {
  readonly repository: PlanningRepository;
  readonly children?: ReactNode;
}

/** Supplies only the domain-facing port; browser database objects stay in app wiring. */
export function PlanningRepositoryProvider({
  repository,
  children,
}: PlanningRepositoryProviderProps) {
  return (
    <PlanningRepositoryContext.Provider value={repository}>
      {children}
    </PlanningRepositoryContext.Provider>
  );
}

// Context hooks intentionally share their provider's module and public boundary.
// eslint-disable-next-line react-refresh/only-export-components
export function usePlanningRepository(): PlanningRepository {
  const repository = useContext(PlanningRepositoryContext);
  if (repository === undefined) {
    throw new Error('usePlanningRepository must be used within PlanningRepositoryProvider');
  }

  return repository;
}
