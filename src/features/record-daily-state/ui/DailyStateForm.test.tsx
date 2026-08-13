import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { nonNegativeDurationMinutes } from '@/shared/lib/ids';
import { instant } from '@/shared/lib/local-date/clock';

import { DailyStateForm } from './DailyStateForm';

afterEach(cleanup);

describe('DailyStateForm', () => {
  it('submits optional integer context and announces a committed save', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<DailyStateForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Энергия 4' }));
    await user.click(screen.getByRole('button', { name: 'Настроение 3' }));
    await user.type(screen.getByLabelText(/сон/i), '450');
    await user.click(screen.getByRole('button', { name: /сохранить состояние/i }));
    expect(onSubmit).toHaveBeenCalledWith({ energy: 4, mood: 3, sleepDurationMinutes: 450 });
    expect(screen.getByRole('status')).toHaveTextContent(/состояние сохранено/i);
  });

  it('submits an empty state without undefined properties and does not claim a failed save', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(false);
    render(<DailyStateForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: /сохранить состояние/i }));
    expect(onSubmit).toHaveBeenCalledWith({});
    expect(screen.queryByRole('status')).toBeNull();
  });

  it.each([
    ['-1', /неотрицательным/i],
    ['1.5', /неотрицательным/i],
  ])('rejects invalid sleep %s before submission', async (value, message) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<DailyStateForm onSubmit={onSubmit} />);
    const control = screen.getByLabelText(/сон/i);
    await user.type(control, value);
    await user.click(screen.getByRole('button', { name: /сохранить состояние/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders immutable persisted context without controls', () => {
    render(
      <DailyStateForm
        initial={{
          energy: 5,
          mood: 4,
          sleepDurationMinutes: nonNegativeDurationMinutes(480),
          updatedAt: instant('2026-08-13T08:00:00.000Z'),
        }}
        immutable
        saveConfirmed
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText(/энергия: 5/i)).toBeVisible();
    expect(screen.getByText(/настроение: 4/i)).toBeVisible();
    expect(screen.getByText(/сон: 480 минут/i)).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders explicit missing values for an immutable empty state', () => {
    render(<DailyStateForm immutable onSubmit={vi.fn()} />);
    expect(screen.getByText(/энергия: не указана/i)).toBeVisible();
    expect(screen.getByText(/настроение: не указано/i)).toBeVisible();
    expect(screen.getByText(/сон: не указан/i)).toBeVisible();
  });
});
