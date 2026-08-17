import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@/shared/ui/icon';

export interface ActionMenuProps {
  readonly triggerLabel: string;
  readonly triggerTitle?: string;
  /** Lets the owner return focus here after a menu item opens a dialog. */
  readonly triggerRef?: RefObject<HTMLButtonElement | null>;
  readonly children: (close: () => void) => ReactNode;
}

interface PopoverPosition {
  readonly top: number;
  readonly left: number;
  readonly openUpward: boolean;
}

const POPOVER_WIDTH = 260;
const POPOVER_ESTIMATED_HEIGHT = 220;
const VIEWPORT_MARGIN = 8;

export function ActionMenu({
  triggerLabel,
  triggerTitle,
  triggerRef: externalTriggerRef,
  children,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PopoverPosition>();
  const ownTriggerRef = useRef<HTMLButtonElement>(null);
  const triggerRef = externalTriggerRef ?? ownTriggerRef;
  const popoverRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
  };

  useLayoutEffect(() => {
    if (!open || triggerRef.current === null) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const openUpward =
      rect.bottom + POPOVER_ESTIMATED_HEIGHT > window.innerHeight &&
      rect.top > POPOVER_ESTIMATED_HEIGHT;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.right - POPOVER_WIDTH),
      window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN,
    );
    setPosition({
      top: openUpward ? rect.top - 6 : rect.bottom + 6,
      left,
      openUpward,
    });
  }, [open, triggerRef]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) === true) return;
      if (popoverRef.current?.contains(target) === true) return;
      // A menu item may open a modal dialog. Its backdrop already blocks all
      // other interaction, so a click inside it is not "outside the menu" in
      // the sense this handler cares about — and closing here would remove
      // the trigger button before the dialog can return focus to it.
      if (target instanceof Element && target.closest('.orbit-dialog-backdrop') !== null) return;
      close();
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, triggerRef]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="orbit-action-menu__trigger"
        aria-label={triggerLabel}
        title={triggerTitle ?? triggerLabel}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <Icon name="more" aria-hidden="true" />
      </button>
      {open && position !== undefined
        ? createPortal(
            <div
              ref={popoverRef}
              className="orbit-action-menu__popover"
              data-open-upward={position.openUpward}
              style={{
                top: position.openUpward ? undefined : position.top,
                bottom: position.openUpward ? window.innerHeight - position.top : undefined,
                left: position.left,
              }}
              aria-label="Доступные действия"
            >
              {children(close)}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
