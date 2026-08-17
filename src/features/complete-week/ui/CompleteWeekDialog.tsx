import { useState } from 'react';
import { ScoreBreakdown, type ScoreBreakdownValue } from '@/entities/planning';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { FormField } from '@/shared/ui/form-field';

export interface CompleteWeekDialogProps {
  readonly open: boolean;
  readonly goals: readonly string[];
  readonly progress: ScoreBreakdownValue;
  readonly onClose: () => void;
  readonly onSubmit: (reflection?: string) => Promise<boolean>;
}
export function CompleteWeekDialog({
  open,
  goals,
  progress,
  onClose,
  onSubmit,
}: CompleteWeekDialogProps) {
  const [reflection, setReflection] = useState('');
  return (
    <Dialog
      open={open}
      title="Завершить неделю"
      description="После завершения неделя и её факты останутся только для чтения."
      onClose={onClose}
    >
      <h3>Цели недели</h3>
      {goals.length === 0 ? (
        <p>Целей не было.</p>
      ) : (
        <ul>
          {goals.map((goal) => (
            <li key={goal}>{goal}</li>
          ))}
        </ul>
      )}
      <ScoreBreakdown score={progress} label="Прогресс недели" periodStatus="open" />
      <FormField id="week-reflection" label="Рефлексия" hint="Необязательно">
        <textarea
          value={reflection}
          onChange={(event) => {
            setReflection(event.target.value);
          }}
        />
      </FormField>
      <footer className="orbit-dialog__actions">
        <Button variant="quiet" onClick={onClose}>
          Вернуться
        </Button>
        <Button
          onClick={() => {
            void onSubmit(reflection).then((saved) => {
              if (saved) onClose();
            });
          }}
        >
          Завершить неделю
        </Button>
      </footer>
    </Dialog>
  );
}
