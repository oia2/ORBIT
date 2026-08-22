import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';

export interface ReopenDayDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => Promise<boolean>;
}

/**
 * Confirms reopening, and says plainly what it will and will not undo.
 *
 * Owner decision D1: reopening does not claw back tasks that closure moved to
 * another day or to the backlog. Saying so here is the difference between a
 * predictable action and a surprising one.
 */
export function ReopenDayDialog({ open, onClose, onConfirm }: ReopenDayDialogProps) {
  return (
    <Dialog
      open={open}
      title="Открыть день заново"
      description="Результат дня перестанет быть зафиксированным и снова будет считаться по фактам."
      onClose={onClose}
    >
      <p>
        Задачи, которые остались незавершёнными, были отменены или выполнены, снова станут доступны
        для изменения.
      </p>
      <p>
        Задачи, перенесённые при закрытии на другой день или в бэклог, останутся там же — вернуть их
        можно вручную.
      </p>
      <div className="orbit-dialog__actions">
        <Button
          onClick={() => {
            void (async () => {
              if (await onConfirm()) onClose();
            })();
          }}
        >
          Открыть день
        </Button>
        <Button variant="quiet" onClick={onClose}>
          Отмена
        </Button>
      </div>
    </Dialog>
  );
}
