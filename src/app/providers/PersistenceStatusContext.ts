import { createContext, useContext } from 'react';

import type { PersistentStorageState } from '../runtime/create-app-runtime';

export const PersistenceStatusContext = createContext<PersistentStorageState | undefined>(
  undefined,
);

export function usePersistenceStatus(): PersistentStorageState | undefined {
  return useContext(PersistenceStatusContext);
}
