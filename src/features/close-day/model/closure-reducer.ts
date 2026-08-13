import type { TaskOccurrenceId } from '@/shared/lib/ids';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

export type CloseDayDraftDisposition =
  | { readonly kind: 'keep-unfinished' }
  | { readonly kind: 'move-to-date'; readonly destinationDate: string; readonly duration: string }
  | { readonly kind: 'move-to-backlog' }
  | { readonly kind: 'cancel' };

export type ClosureDraft = Readonly<Record<string, CloseDayDraftDisposition | undefined>>;

export function createClosureDraft(ids: readonly TaskOccurrenceId[]): ClosureDraft {
  return Object.fromEntries(ids.map((id) => [id, undefined]));
}

export function setClosureDisposition(
  draft: ClosureDraft,
  occurrenceId: TaskOccurrenceId,
  disposition: CloseDayDraftDisposition | undefined,
): ClosureDraft {
  return { ...draft, [occurrenceId]: disposition };
}

export type ValidClosureDraft = Readonly<
  Record<
    string,
    | { readonly kind: 'keep-unfinished' }
    | {
        readonly kind: 'move-to-date';
        readonly destinationDate: LocalDate;
        readonly duration: number;
      }
    | { readonly kind: 'move-to-backlog' }
    | { readonly kind: 'cancel' }
  >
>;

export function validateClosureDraft(
  ids: readonly TaskOccurrenceId[],
  draft: ClosureDraft,
  availableMoveDates: readonly LocalDate[],
):
  | { readonly ok: true; readonly value: ValidClosureDraft }
  | { readonly ok: false; readonly message: string } {
  const result: Record<string, ValidClosureDraft[string]> = {};
  for (const id of ids) {
    const disposition = draft[id];
    if (disposition === undefined)
      return { ok: false, message: 'Выберите действие для каждой незавершённой задачи.' };
    if (disposition.kind === 'move-to-date') {
      const duration = Number(disposition.duration);
      if (!availableMoveDates.includes(disposition.destinationDate as LocalDate))
        return { ok: false, message: 'Выберите другой открытый день для переноса.' };
      if (!Number.isInteger(duration) || duration <= 0)
        return {
          ok: false,
          message: 'Длительность переноса должна быть целым числом больше нуля.',
        };
      result[id] = {
        kind: disposition.kind,
        destinationDate: disposition.destinationDate as LocalDate,
        duration,
      };
    } else result[id] = disposition;
  }
  return { ok: true, value: result };
}
