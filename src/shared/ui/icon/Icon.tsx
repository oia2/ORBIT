import type { SVGProps } from 'react';

export type IconName =
  | 'week'
  | 'day'
  | 'backlog'
  | 'history'
  | 'close'
  | 'plus'
  | 'edit'
  | 'calendar'
  | 'trash'
  | 'more'
  | 'arrow-up'
  | 'check';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children' | 'name'> {
  readonly name: IconName;
  readonly label?: string;
  readonly size?: 16 | 20 | 24;
}

function IconPath({ name }: { readonly name: IconName }) {
  switch (name) {
    case 'week':
      return <path d="M4 6.5h16v13H4zM7 3.5v6M17 3.5v6M4 10h16" />;
    case 'day':
      return (
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
      );
    case 'backlog':
      return <path d="M5 4h14l2 6v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-9l2-6ZM3 11h5l2 3h4l2-3h5" />;
    case 'history':
      return <path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.5M4 4v4.5h4.5M12 7.5V12l3 2" />;
    case 'close':
      return <path d="m6 6 12 12M18 6 6 18" />;
    case 'plus':
      return <path d="M12 5v14M5 12h14" />;
    case 'edit':
      return <path d="M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4" />;
    case 'calendar':
      return <path d="M4 6h16v14H4zM8 3v6M16 3v6M4 10h16" />;
    case 'trash':
      return <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />;
    case 'more':
      return <path d="M5 12h.01M12 12h.01M19 12h.01" />;
    case 'arrow-up':
      return <path d="m6 11 6-6 6 6M12 5v14" />;
    case 'check':
      return <path d="m5 12 4 4L19 6" />;
  }
}

export function Icon({ name, label, size = 20, ...svgProps }: IconProps) {
  const accessibleProps =
    label === undefined
      ? ({ 'aria-hidden': true } as const)
      : ({ 'aria-label': label, role: 'img' } as const);

  return (
    <svg
      {...svgProps}
      {...accessibleProps}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      <IconPath name={name} />
    </svg>
  );
}
