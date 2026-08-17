/**
 * Renders a minute count in Russian, rolling up to hours past 60 so long
 * durations read as "3 ч 33 мин" rather than "213 мин".
 */
export function formatDurationMinutes(value: number): string {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (hours === 0) return `${String(minutes)} мин`;
  return minutes === 0 ? `${String(hours)} ч` : `${String(hours)} ч ${String(minutes)} мин`;
}
