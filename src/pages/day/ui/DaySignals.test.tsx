import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { nonNegativeDurationMinutes } from '@/shared/lib/ids';
import { buildOpenDay, buildScoreBreakdown } from '../../../../tests/fixtures/planning';

import { DaySignals } from './DaySignals';

afterEach(cleanup);

describe('DaySignals', () => {
  it('shows the primary score with transparent per-category counts and separate state context', () => {
    render(<DaySignals day={buildOpenDay()} score={buildScoreBreakdown()} onSave={vi.fn()} />);
    const region = screen.getByRole('region', { name: /дневной результат/i });
    expect(region).toHaveTextContent(/60%/);
    expect(region).toHaveTextContent(/задачи/i);
    expect(region).toHaveTextContent(/2 из 3/);
    expect(region).toHaveTextContent(/привычки/i);
    expect(region).toHaveTextContent(/1 из 2/);
    // 003 FR-019 keeps both category breakdowns visible; FR-020 removed the 70/30 wording.
    expect(region).toHaveTextContent(/весят одинаково/i);
    expect(screen.getByRole('heading', { name: /состояние дня/i })).toBeVisible();
    expect(screen.getByRole('group', { name: /энергия/i })).toBeVisible();
    expect(screen.getByRole('group', { name: /настроение/i })).toBeVisible();
    expect(screen.getByLabelText(/сон/i)).toBeVisible();
    expect(screen.queryByText(/плановая нагрузка|перегруз|вместимость|лимит нагрузки/i)).toBeNull();
  });

  it('validates and preserves state drafts, and makes closed state immutable', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(false);
    const { rerender } = render(
      <DaySignals day={buildOpenDay()} score={buildScoreBreakdown()} onSave={onSave} />,
    );
    await user.click(screen.getByRole('button', { name: 'Энергия 5' }));
    await user.clear(screen.getByLabelText(/сон/i));
    await user.type(screen.getByLabelText(/сон/i), '-1');
    await user.click(screen.getByRole('button', { name: /сохранить состояние/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/неотрицательным/i);
    expect(screen.getByRole('button', { name: 'Энергия 5' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    rerender(
      <DaySignals
        day={{
          ...buildOpenDay(),
          status: 'closed',
          closureSnapshot: {
            score: buildScoreBreakdown(),
            plannedLoadMinutes: nonNegativeDurationMinutes(0),
          },
          closedAt: '2026-05-20T05:00:00.000Z' as never,
        }}
        score={buildScoreBreakdown()}
        onSave={onSave}
      />,
    );
    expect(screen.queryByRole('button', { name: /сохранить состояние/i })).toBeNull();
  });
});
