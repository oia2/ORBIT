import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import { Icon } from '@/shared/ui/icon';

export interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  title,
  description,
  children,
  onClose,
  returnFocusRef,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const explicitReturnTarget = returnFocusRef?.current;
    // Prefer the first control inside the body so the header's close button
    // never steals initial focus from the form.
    const body = dialogRef.current?.querySelector('.orbit-dialog__body');
    const focusTarget =
      body?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusTarget ?? dialogRef.current)?.focus();

    return () => {
      (explicitReturnTarget ?? previouslyFocused)?.focus();
    };
  }, [open, returnFocusRef]);

  if (!open) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="orbit-dialog-backdrop" role="presentation">
      <dialog
        ref={dialogRef}
        className="orbit-dialog"
        open
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description === undefined ? undefined : descriptionId}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="orbit-dialog__header">
          <div className="orbit-dialog__heading">
            <h2 className="orbit-dialog__title" id={titleId}>
              {title}
            </h2>
            {description === undefined ? null : (
              <p className="orbit-dialog__description" id={descriptionId}>
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            className="orbit-dialog__close"
            aria-label="Закрыть форму"
            title="Закрыть"
            onClick={onClose}
          >
            <Icon name="close" aria-hidden="true" />
          </button>
        </header>
        <div className="orbit-dialog__body">{children}</div>
      </dialog>
    </div>
  );
}
