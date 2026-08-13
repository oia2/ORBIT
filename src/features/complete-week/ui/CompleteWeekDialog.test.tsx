import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildScoreBreakdown } from '../../../../tests/fixtures/planning';
import { CompleteWeekDialog } from './CompleteWeekDialog';

afterEach(cleanup);
describe('CompleteWeekDialog', () => {
  it('shows progress counts/rates, descriptive goals, reflection and commit-only completion', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(
      <CompleteWeekDialog
        open
        goals={['Подготовить обзор']}
        progress={buildScoreBreakdown()}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText('Подготовить обзор')).toBeVisible();
    expect(screen.getByRole('region', { name: /прогресс недели/i })).toHaveTextContent(
      /62%.*2 из 3.*1 из 2/is,
    );
    await user.type(screen.getByLabelText(/рефлексия/i), 'Что помогло');
    await user.click(screen.getByRole('button', { name: /завершить неделю/i }));
    expect(onSubmit).toHaveBeenCalledWith('Что помогло');
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the dialog open when the atomic command fails and handles an empty review', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(false);
    const onClose = vi.fn();
    render(
      <CompleteWeekDialog
        open
        goals={[]}
        progress={buildScoreBreakdown({ value: 'unavailable' })}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText(/целей не было/i)).toBeVisible();
    await user.click(screen.getByRole('button', { name: /завершить неделю/i }));
    expect(onSubmit).toHaveBeenCalledWith('');
    expect(onClose).not.toHaveBeenCalled();
  });
});
