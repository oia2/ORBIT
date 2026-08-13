import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

import { Icon, type IconName } from '@/shared/ui/icon';
import type { LocalDate } from '@/shared/lib/local-date/local-date';

import { buildDayPath, buildWeekPath, BACKLOG_PATH, HISTORY_PATH } from '../routes/paths';
import { usePersistenceStatus } from '../providers/PersistenceStatusContext';
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

const READY_PERSISTENCE_LABEL = 'Сохранено на устройстве';

const READY_PERSISTENCE_DISCLOSURE =
  'Планы хранятся только на этом устройстве в текущем профиле браузера и не синхронизируются с другими устройствами. Они сохраняются между обычными сеансами в этом профиле, пока доступно хранилище сайта. Эта гарантия не действует после явного удаления данных сайта, удаления или сброса профиля, в приватном режиме, а также если браузер или операционная система очистят хранилище.';

export function AppShell({ currentDate, children }: AppShellProps) {
  const persistenceStatus = usePersistenceStatus();
  const navigation: readonly NavigationItem[] = [
    { label: 'Сегодня', to: buildDayPath(currentDate), icon: 'day' },
    { label: 'Неделя', to: buildWeekPath(currentDate), icon: 'week' },
    { label: 'Бэклог', to: BACKLOG_PATH, icon: 'backlog' },
    { label: 'История', to: HISTORY_PATH, icon: 'history' },
  ];

  const persistenceCopy = `${READY_PERSISTENCE_DISCLOSURE}${
    persistenceStatus === 'denied'
      ? ' Браузер не предоставил постоянное хранилище, поэтому данные могут быть очищены автоматически.'
      : persistenceStatus === 'unsupported'
        ? ' Браузер не поддерживает запрос постоянного хранилища, поэтому данные могут быть очищены автоматически.'
        : ''
  }`;

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
        {persistenceStatus === undefined ? null : (
          <details
            className={styles.persistence}
            data-state={persistenceStatus}
            data-od-id="persistence-status"
          >
            <summary
              aria-label={`${READY_PERSISTENCE_LABEL}. Показать условия локального хранения`}
            >
              <span className={styles.persistenceMarker} aria-hidden="true">
                ✓
              </span>
              <span role="status" aria-label={READY_PERSISTENCE_LABEL}>
                {READY_PERSISTENCE_LABEL}
              </span>
            </summary>
            <div className={styles.persistenceDetails} role="note">
              <strong>Локальное хранение</strong>
              <p>{persistenceCopy}</p>
            </div>
          </details>
        )}
      </aside>
      <main className={styles.main} data-od-id="app-content">
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
