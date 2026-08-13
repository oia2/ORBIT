import { type ButtonHTMLAttributes, type ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  readonly statusText?: ReactNode;
}

export function Button({
  variant = 'primary',
  statusText,
  className,
  type = 'button',
  children,
  ...buttonProps
}: ButtonProps) {
  const classes = ['orbit-button', className].filter(Boolean).join(' ');

  return (
    <button {...buttonProps} type={type} className={classes} data-variant={variant}>
      {children}
      {statusText === undefined ? null : <span className="visually-hidden">{statusText}</span>}
    </button>
  );
}
