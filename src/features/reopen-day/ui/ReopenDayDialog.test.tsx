import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReopenDayDialog } from './ReopenDayDialog';

afterEach(cleanup);

describe('ReopenDayDialog', () => {
  it('explains D1 and cancels without reopening', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(true);
    render(<ReopenDayDialog open onClose={onClose} onConfirm={onConfirm} />);

    expect(screen.getByRole('dialog', { name: /открыть день заново/i })).toHaveTextContent(
      /перенесённые.*на другой день или в бэклог.*останутся там же/is,
    );
    await user.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('closes only after a successful confirmation', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(true);
    render(<ReopenDayDialog open onClose={onClose} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Открыть день' }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('stays open when reopening fails', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(false);
    render(<ReopenDayDialog open onClose={onClose} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Открыть день' }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: /открыть день заново/i })).toBeVisible();
  });
});
