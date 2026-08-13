import { useState } from 'react';

import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { FormField } from '@/shared/ui/form-field';

export interface WeekEditorDialogProps {
  readonly open: boolean;
  readonly initialStatement?: string;
  readonly onClose: () => void;
  readonly onSubmit: (statement: string) => Promise<boolean>;
}

export function WeekEditorDialog({
  open,
  initialStatement = '',
  onClose,
  onSubmit,
}: WeekEditorDialogProps) {
  const [statement, setStatement] = useState(initialStatement);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (statement.trim().length === 0) {
      setError('Введите цель недели.');
      return;
    }
    setSaving(true);
    const saved = await onSubmit(statement);
    setSaving(false);
    if (saved) onClose();
  };

  return (
    <Dialog
      open={open}
      title={initialStatement.length === 0 ? 'Новая цель недели' : 'Редактировать цель'}
      onClose={onClose}
    >
      <FormField id="weekly-goal" label="Цель недели" error={error}>
        <textarea
          value={statement}
          onChange={(event) => {
            setStatement(event.target.value);
          }}
        />
      </FormField>
      <footer className="orbit-dialog__actions">
        <Button variant="quiet" onClick={onClose}>
          Отмена
        </Button>
        <Button disabled={saving} onClick={() => void submit()}>
          Сохранить
        </Button>
      </footer>
    </Dialog>
  );
}
