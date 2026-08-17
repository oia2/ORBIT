/// <reference types="node" />

import { createRef } from 'react';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { localDate } from '@/shared/lib/local-date/local-date';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/dialog';
import { FormField } from '@/shared/ui/form-field';
import { Icon } from '@/shared/ui/icon';
import { OrbitMetric } from '@/shared/ui/orbit-metric';

import { PersistenceStatusContext } from '../providers/PersistenceStatusContext';
import { AppShell } from './AppShell';

const globalStyles = readFileSync('src/app/styles/global.css', 'utf8');
const shellStyles = readFileSync('src/app/layout/AppShell.module.css', 'utf8');

afterEach(cleanup);

describe('AppShell', () => {
  it('renders the Russian four-area shell and current canonical links only', () => {
    render(
      <MemoryRouter initialEntries={['/week/2026-05-18']}>
        <AppShell currentDate={localDate('2026-05-20')}>
          <h1>Обзор недели</h1>
        </AppShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('navigation', { name: /основная навигация/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^сегодня$/i })).toHaveAttribute(
      'href',
      '/day/2026-05-20',
    );
    expect(screen.getByRole('link', { name: /^неделя$/i })).toHaveAttribute(
      'href',
      '/week/2026-05-18',
    );
    expect(screen.getByRole('link', { name: /^бэклог$/i })).toHaveAttribute('href', '/backlog');
    expect(screen.getByRole('link', { name: /^история$/i })).toHaveAttribute('href', '/history');
    expect(screen.queryByText(/трениров/i)).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('heading', { name: 'Обзор недели' }),
    );
  });

  it('keeps navigation keyboard-operable with visible focus semantics', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/']}>
        <AppShell currentDate={localDate('2026-05-20')} />
      </MemoryRouter>,
    );

    await user.tab();
    expect(screen.getByRole('link', { name: /^сегодня$/i })).toHaveFocus();
    expect(globalStyles).toContain(':focus-visible');
  });

  it('encodes the reconciled responsive, 44px-target, and reduced-motion foundations', () => {
    expect(globalStyles).toMatch(/min-height:\s*44px/);
    expect(globalStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(shellStyles).toContain('@media (max-width: 720px)');
    expect(shellStyles).toContain('@media (max-width: 1050px) and (min-width: 721px)');
    expect(shellStyles).toMatch(/grid-template-columns:\s*220px minmax\(0, 1fr\)/);
  });

  it('renders the exact ready status with a non-color marker and discoverable disclosure', async () => {
    const user = userEvent.setup();
    render(
      <PersistenceStatusContext.Provider value="granted">
        <MemoryRouter>
          <AppShell currentDate={localDate('2026-05-20')} />
        </MemoryRouter>
      </PersistenceStatusContext.Provider>,
    );

    const persistence = document.querySelector('[data-od-id="persistence-status"]');
    const summary = persistence?.querySelector('summary');
    const marker = summary?.querySelector('[aria-hidden="true"]');

    expect(persistence).not.toBeNull();
    expect(persistence?.closest('[data-od-id="app-rail"]')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(/^Сохранено на устройстве$/);
    expect(marker).toHaveTextContent('✓');
    expect(summary).toHaveAccessibleName(
      'Сохранено на устройстве. Показать условия локального хранения',
    );
    expect(persistence).not.toHaveAttribute('open');

    if (!(summary instanceof HTMLElement)) {
      throw new Error('Persistence summary was not rendered');
    }
    await user.click(summary);

    expect(persistence).toHaveAttribute('open');
    expect(screen.getByRole('note')).toHaveTextContent(/только на этом устройстве/i);
    expect(screen.getByRole('note')).toHaveTextContent(/между обычными сеансами/i);
    expect(screen.getByRole('note')).toHaveTextContent(/не синхронизируются/i);
  });
});

describe('accessible shared visual controls', () => {
  it('provides a 44px button primitive without color-only state', () => {
    render(<Button statusText="Сохранено">Сохранить</Button>);

    expect(screen.getByRole('button', { name: /сохранить/i })).toHaveClass('orbit-button');
    expect(screen.getByText('Сохранено')).toHaveClass('visually-hidden');
  });

  it('connects FormField labels, hints, and errors to its control', () => {
    render(
      <FormField id="goal" label="Цель недели" hint="Свободный текст" error="Введите цель">
        <input />
      </FormField>,
    );

    const input = screen.getByRole('textbox', { name: 'Цель недели' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/свободный текст.*введите цель/i);
    expect(screen.getByRole('alert')).toHaveTextContent('Введите цель');
  });

  it('renders decorative and labelled monoline icons accessibly', () => {
    const { rerender } = render(<Icon name="week" />);
    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    rerender(<Icon name="history" label="История" />);
    expect(screen.getByRole('img', { name: 'История' })).toBeInTheDocument();
  });

  it.each([
    [82, 'Успешно'],
    [62, 'Частично'],
    [31, 'В процессе'],
  ])('labels an open %s%% score with the approved status band', (value, status) => {
    render(
      <OrbitMetric label="Дневной результат" value={value} tone="warning" periodStatus="open" />,
    );

    expect(screen.getByText(`${String(value)}%`)).toBeInTheDocument();
    expect(screen.getByText(status)).toBeInTheDocument();
    // Judgemental wording stays prohibited; the bands are factual thresholds.
    expect(screen.queryByText(/плохо|отлично|молодец/i)).not.toBeInTheDocument();
  });

  it('reports period and data states ahead of the score band', () => {
    const { rerender } = render(
      <OrbitMetric label="Дневной результат" value={90} periodStatus="not-started" />,
    );
    expect(screen.getByText('Не начат')).toBeInTheDocument();

    rerender(<OrbitMetric label="Дневной результат" value="unavailable" periodStatus="open" />);
    expect(screen.getByText('Пока нет данных')).toBeInTheDocument();

    rerender(<OrbitMetric label="Дневной результат" value={90} periodStatus="closed" />);
    expect(screen.getByText('Итог сохранён')).toBeInTheDocument();
  });

  it('moves focus into a dialog, closes on Escape, and returns focus', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn<() => void>();
    const returnFocusRef = createRef<HTMLButtonElement>();
    const { rerender } = render(
      <>
        <button ref={returnFocusRef}>Открыть</button>
        <Dialog open title="Новая задача" onClose={onClose} returnFocusRef={returnFocusRef}>
          <Button>Сохранить</Button>
        </Dialog>
      </>,
    );

    expect(screen.getByRole('dialog', { name: 'Новая задача' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();

    rerender(
      <>
        <button ref={returnFocusRef}>Открыть</button>
        <Dialog open={false} title="Новая задача" onClose={onClose} returnFocusRef={returnFocusRef}>
          <Button>Сохранить</Button>
        </Dialog>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Открыть' })).toHaveFocus();
  });
});
