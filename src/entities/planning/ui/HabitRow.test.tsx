import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { entityId, revision } from '@/shared/lib/ids';
import { instant } from '@/shared/lib/local-date/clock';
import { localDate } from '@/shared/lib/local-date/local-date';

import type { HabitOccurrence } from '../model/habit';
import { HabitRow } from './HabitRow';

afterEach(cleanup);

const pending: HabitOccurrence = {
  id: entityId<'habit-occurrence'>('00000000-0000-4000-8000-000000000001'),
  definitionId: entityId<'habit-definition'>('00000000-0000-4000-8000-000000000002'),
  date: localDate('2026-05-20'),
  weekStart: localDate('2026-05-18'),
  definitionSnapshot: { title: 'Прогулка' },
  ruleRevision: revision(1),
  isException: false,
  outcome: 'pending',
  outcomeEvents: [],
  updatedAt: instant('2026-05-20T08:00:00.000Z'),
};

describe('HabitRow', () => {
  it('marks the habit completed from the row itself', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<HabitRow occurrence={pending} onToggle={onToggle} />);

    const toggle = screen.getByRole('button', { name: /отметить «Прогулка» выполненной/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();
    expect(screen.getByText('Ожидает отметки')).toBeVisible();
  });

  it('undoes a completed mark from the same row control', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<HabitRow occurrence={{ ...pending, outcome: 'completed' }} onToggle={onToggle} />);

    const toggle = screen.getByRole('button', { name: /снять отметку с «Прогулка»/i });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(toggle);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('renders a decided outcome as a fact without a row control', () => {
    render(<HabitRow occurrence={{ ...pending, outcome: 'completed' }} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Выполнено')).toBeVisible();
    expect(document.querySelector('[data-outcome="completed"]')).not.toBeNull();
  });
});
