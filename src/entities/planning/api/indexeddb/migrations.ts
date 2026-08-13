import type { IDBPDatabase } from 'idb';

import type { OrbitPlanningDB } from './schema';

function migrateToVersion1(database: IDBPDatabase<OrbitPlanningDB>): void {
  database.createObjectStore('weeks', { keyPath: 'startDate' });

  const days = database.createObjectStore('days', { keyPath: 'date' });
  days.createIndex('by-weekStart', 'weekStart');

  database.createObjectStore('taskSeries', { keyPath: 'id' });

  const taskOccurrences = database.createObjectStore('taskOccurrences', {
    keyPath: 'id',
  });
  taskOccurrences.createIndex('by-series-date', ['seriesId', 'nominalDate'], {
    unique: true,
  });
  taskOccurrences.createIndex('by-created-sequence', 'createdSequence', {
    unique: true,
  });
  taskOccurrences.createIndex('by-placement-created', ['placementKey', 'createdSequence']);

  const taskPlanEntries = database.createObjectStore('taskPlanEntries', {
    keyPath: 'id',
  });
  taskPlanEntries.createIndex('by-occurrence-date', ['occurrenceId', 'date'], { unique: true });
  taskPlanEntries.createIndex('by-date', 'date');
  taskPlanEntries.createIndex('by-weekStart', 'weekStart');

  const taskEvents = database.createObjectStore('taskEvents', {
    keyPath: 'sequence',
    autoIncrement: true,
  });
  taskEvents.createIndex('by-id', 'id', { unique: true });
  taskEvents.createIndex('by-occurrence-sequence', ['occurrenceId', 'sequence']);
  taskEvents.createIndex('by-series-sequence', ['seriesId', 'sequence']);
  taskEvents.createIndex('by-effective-date-sequence', ['effectiveDate', 'sequence']);

  database.createObjectStore('habitDefinitions', { keyPath: 'id' });

  const habitOccurrences = database.createObjectStore('habitOccurrences', {
    keyPath: 'id',
  });
  habitOccurrences.createIndex('by-definition-date', ['definitionId', 'date'], { unique: true });
  habitOccurrences.createIndex('by-date', 'date');
  habitOccurrences.createIndex('by-weekStart', 'weekStart');
}

/** Sequential upgrade entry point. Future versions append another oldVersion guard. */
export function upgradeOrbitPlanningDatabase(
  database: IDBPDatabase<OrbitPlanningDB>,
  oldVersion: number,
): void {
  if (oldVersion < 1) {
    migrateToVersion1(database);
  }
}
