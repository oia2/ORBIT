/**
 * Journeys must not pin calendar dates: several ORBIT rules are relative to the
 * current local date (closure eligibility, habit effective start, recurrence
 * D+1, History defaults), so hard-coded dates silently rot once the authoring
 * week passes. These helpers derive every date the journeys need at run time.
 */

const RU_WEEKDAYS = [
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
  'воскресенье',
] as const;

function toISO(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${String(date.getFullYear())}-${month}-${day}`;
}

export function todayISO(): string {
  return toISO(new Date());
}

export function shiftedISO(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toISO(date);
}

/** Monday of the week containing `today` plus `weekOffset` weeks. */
export function mondayISO(weekOffset = 0): string {
  const date = new Date();
  const isoWeekday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - isoWeekday + weekOffset * 7);
  return toISO(date);
}

/** A date inside the week identified by `mondayISO(weekOffset)`; 0 = Monday. */
export function weekDayISO(dayIndex: number, weekOffset = 0): string {
  const monday = new Date(`${mondayISO(weekOffset)}T00:00:00`);
  monday.setDate(monday.getDate() + dayIndex);
  return toISO(monday);
}

export function isoWeekdayIndex(iso: string): number {
  return (new Date(`${iso}T00:00:00`).getDay() + 6) % 7;
}

export function weekdayLabel(iso: string): string {
  return RU_WEEKDAYS[isoWeekdayIndex(iso)] ?? 'понедельник';
}

/** "13 августа" — matches how ORBIT renders a day inside the planner. */
export function dayMonthLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  });
}

/** ru-RU appends " г." to year-bearing formats; ORBIT's copy does not. */
function withoutYearSuffix(value: string): string {
  return value.replace(/\s*г\.$/u, '');
}

/** "13 августа 2026" — matches History's selected-date copy. */
export function dayMonthYearLabel(iso: string): string {
  return withoutYearSuffix(
    new Date(`${iso}T00:00:00`).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  );
}

export function monthYearLabel(iso: string): string {
  return withoutYearSuffix(
    new Date(`${iso}T00:00:00`).toLocaleDateString('ru-RU', {
      month: 'long',
      year: 'numeric',
    }),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Matches a planner day's summary, e.g. /вторник.*11 августа/i. */
export function plannerDayPattern(iso: string): RegExp {
  return new RegExp(`${weekdayLabel(iso)}.*${escapeRegExp(dayMonthLabel(iso))}`, 'i');
}

export function labelPattern(value: string): RegExp {
  return new RegExp(escapeRegExp(value), 'i');
}
