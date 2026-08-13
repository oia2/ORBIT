import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { nonNegativeDurationMinutes } from '@/shared/lib/ids';
import { buildOpenDay, buildScoreBreakdown } from '../../../../tests/fixtures/planning';

import { DaySignals } from './DaySignals';

afterEach(cleanup);

describe('DaySignals', () => {
  it('shows the primary score with transparent 70/30 counts and separate state context', () => {
    render(<DaySignals day={buildOpenDay()} score={buildScoreBreakdown()} onSave={vi.fn()} />);
    expect(screen.getByRole('region', { name: /дневной результат/i })).toHaveTextContent(
      /62%.*задачи 2 из 3.*привычки 1 из 2.*70%.*30%/is,
    );
    expect(screen.getByRole('heading', { name: /состояние дня/i })).toBeVisible();
    expect(screen.getByRole('group', { name: /энергия/i })).toBeVisible();
    expect(screen.getByRole('group', { name: /настроение/i })).toBeVisible();
    expect(screen.getByLabelText(/сон.*минут/i)).toBeVisible();
    expect(screen.queryByText(/плановая нагрузка|перегруз|вместимость|лимит нагрузки/i)).toBeNull();
  });

  it('validates and preserves state drafts, and makes closed state immutable', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(false);
    const { rerender } = render(
      <DaySignals day={buildOpenDay()} score={buildScoreBreakdown()} onSave={onSave} />,
    );
    await user.click(screen.getByRole('button', { name: 'Энергия 5' }));
    await user.type(screen.getByLabelText(/сон.*минут/i), '-1');
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
