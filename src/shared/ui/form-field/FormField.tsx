import { cloneElement, useId, type ReactElement, type ReactNode } from 'react';

interface FormFieldControlProps {
  readonly id?: string;
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: boolean;
}

export interface FormFieldProps {
  readonly id: string;
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  readonly children: ReactElement<FormFieldControlProps>;
}

export function FormField({ id, label, hint, error, children }: FormFieldProps) {
  const generatedId = useId();
  const hintId = `${generatedId}-hint`;
  const errorId = `${generatedId}-error`;
  const describedBy = [
    hint === undefined ? undefined : hintId,
    error === undefined ? undefined : errorId,
  ]
    .filter(Boolean)
    .join(' ');
  const control = cloneElement(children, {
    id,
    ...(describedBy.length === 0 ? {} : { 'aria-describedby': describedBy }),
    ...(error === undefined ? {} : { 'aria-invalid': true }),
  });

  return (
    <div className="orbit-field">
      <label className="orbit-field__label" htmlFor={id}>
        {label}
      </label>
      {control}
      {hint === undefined ? null : (
        <p className="orbit-field__hint" id={hintId}>
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p className="orbit-field__error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
