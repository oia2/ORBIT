import type { DBSchema } from 'idb';

import type { Day } from '../../model/day';
import type { HabitDefinition, HabitOccurrence } from '../../model/habit';
import type { TaskEvent, TaskOccurrence, TaskPlanEntry, TaskSeries } from '../../model/task';
import type { Week } from '../../model/week';

export const ORBIT_DATABASE_NAME = 'orbit-planning';
export const ORBIT_DATABASE_VERSION = 1;

export const ORBIT_STORE_NAMES = [
  'weeks',
  'days',
  'taskSeries',
  'taskOccurrences',
  'taskPlanEntries',
  'taskEvents',
  'habitDefinitions',
  'habitOccurrences',
] as const;

export type OrbitStoreName = (typeof ORBIT_STORE_NAMES)[number];

export type TaskPlacementKey = `day:${string}` | 'backlog' | 'none';

/** Internal index projection; `placementKey` never leaves the adapter. */
export type StoredTaskOccurrence = TaskOccurrence & {
  readonly placementKey: TaskPlacementKey;
};

export interface OrbitPlanningDB extends DBSchema {
  weeks: {
    key: string;
    value: Week;
  };
  days: {
    key: string;
    value: Day;
    indexes: {
      'by-weekStart': string;
    };
  };
  taskSeries: {
    key: string;
    value: TaskSeries;
  };
  taskOccurrences: {
    key: string;
    value: StoredTaskOccurrence;
    indexes: {
      'by-series-date': [string, string];
      'by-created-sequence': number;
      'by-placement-created': [TaskPlacementKey, number];
    };
  };
  taskPlanEntries: {
    key: string;
    value: TaskPlanEntry;
    indexes: {
      'by-occurrence-date': [string, string];
      'by-date': string;
      'by-weekStart': string;
    };
  };
  taskEvents: {
    key: number;
    value: TaskEvent;
    indexes: {
      'by-id': string;
      'by-occurrence-sequence': [string, number];
      'by-series-sequence': [string, number];
      'by-effective-date-sequence': [string, number];
    };
  };
  habitDefinitions: {
    key: string;
    value: HabitDefinition;
  };
  habitOccurrences: {
    key: string;
    value: HabitOccurrence;
    indexes: {
      'by-definition-date': [string, string];
      'by-date': string;
      'by-weekStart': string;
    };
  };
}
