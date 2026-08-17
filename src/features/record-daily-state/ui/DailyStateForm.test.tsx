import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { nonNegativeDurationMinutes } from '@/shared/lib/ids';
import { instant } from '@/shared/lib/local-date/clock';

import { DailyStateForm } from './DailyStateForm';

afterEach(cleanup);

describe('DailyStateForm', () => {
  it('submits optional context including fractional sleep hours converted to minutes', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<DailyStateForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Энергия 4' }));
    await user.click(screen.getByRole('button', { name: 'Настроение 3' }));
    await user.clear(screen.getByLabelText(/сон/i));
    await user.type(screen.getByLabelText(/сон/i), '7.5');
    await user.click(screen.getByRole('button', { name: /сохранить состояние/i }));
    expect(onSubmit).toHaveBeenCalledWith({ energy: 4, mood: 3, sleepDurationMinutes: 450 });
    expect(screen.getByRole('status')).toHaveTextContent(/состояние сохранено/i);
  });

  it('defaults sleep to 8 hours but still submits an otherwise-untouched state as editable', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(false);
    render(<DailyStateForm onSubmit={onSubmit} />);
    expect(screen.getByLabelText(/сон/i)).toHaveValue(8);
    await user.click(screen.getByRole('button', { name: /сохранить состояние/i }));
    expect(onSubmit).toHaveBeenCalledWith({ sleepDurationMinutes: 480 });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('rejects a negative sleep value before submission', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DailyStateForm onSubmit={onSubmit} />);
    const control = screen.getByLabelText(/сон/i);
    await user.clear(control);
    await user.type(control, '-1');
    await user.click(screen.getByRole('button', { name: /сохранить состояние/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/неотрицательным/i);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders immutable persisted context without controls', () => {
    render(
      <DailyStateForm
        initial={{
          energy: 5,
          mood: 4,
          sleepDurationMinutes: nonNegativeDurationMinutes(450),
          updatedAt: instant('2026-08-13T08:00:00.000Z'),
        }}
        immutable
        saveConfirmed
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText(/энергия: 5/i)).toBeVisible();
    expect(screen.getByText(/настроение: 4/i)).toBeVisible();
    expect(screen.getByText(/сон: 7,5 ч/i)).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders explicit missing values for an immutable empty state', () => {
    render(<DailyStateForm immutable onSubmit={vi.fn()} />);
    expect(screen.getByText(/энергия: не указана/i)).toBeVisible();
    expect(screen.getByText(/настроение: не указано/i)).toBeVisible();
    expect(screen.getByText(/сон: не указан/i)).toBeVisible();
  });
});
