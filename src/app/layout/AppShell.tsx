import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

import { Icon, type IconName } from '@/shared/ui/icon';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

import { buildDayPath, buildWeekPath, BACKLOG_PATH, HISTORY_PATH } from '../routes/paths';
import styles from './AppShell.module.css';

export interface AppShellProps {
  readonly currentDate: LocalDate;
  readonly children?: ReactNode;
}

interface NavigationItem {
  readonly label: string;
  readonly to: string;
  readonly icon: IconName;
}

/*
 * The device-local storage disclosure that used to live in this rail is gone
 * (002 FR-015): plans are no longer tied to one browser profile, so the caveats
 * it explained — site data being cleared, a profile reset, a browser refusing
 * persistent storage — no longer describe anything true. It is the only
 * user-facing wording this feature removes.
 */
export function AppShell({ currentDate, children }: AppShellProps) {
  const navigation: readonly NavigationItem[] = [
    { label: 'Сегодня', to: buildDayPath(currentDate), icon: 'day' },
    { label: 'Неделя', to: buildWeekPath(currentDate), icon: 'week' },
    { label: 'Бэклог', to: BACKLOG_PATH, icon: 'backlog' },
    { label: 'История', to: HISTORY_PATH, icon: 'history' },
  ];

  return (
    <div className={styles.shell} data-od-id="app-shell">
      <aside className={styles.rail} data-od-id="app-rail">
        <div className={styles.brand} aria-label="ORBIT">
          <span className={styles.brandMark} aria-hidden="true" />
          <span className={styles.brandWord}>Orbit</span>
        </div>
        <nav
          className={styles.navigation}
          aria-label="Основная навигация"
          data-od-id="mobile-navigation"
        >
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) =>
                [
                  'orbit-nav-link',
                  styles.navigationLink,
                  isActive ? styles.navigationLinkActive : undefined,
                ]
                  .filter(Boolean)
                  .join(' ')
              }
              to={item.to}
            >
              <Icon name={item.icon} aria-hidden="true" />
              <span className={styles.navigationLabel}>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className={styles.main} data-od-id="app-content">
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
