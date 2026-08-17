import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OrbitMetric } from './OrbitMetric';

/**
 * jsdom has neither a 2D canvas nor ResizeObserver, so the orbital field is
 * exercised against stubs. The reduced-motion path is the default there, which
 * is also the path visual regression runs in.
 */
function stubCanvas() {
  const context = {
    clearRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    ellipse: vi.fn(),
    stroke: vi.fn(),
    setTransform: vi.fn(),
    textAlign: '',
    textBaseline: '',
    font: '',
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  return context;
}

function allowMotion(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn() }),
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OrbitMetric', () => {
  it('renders the value without motion when the field cannot draw', () => {
    render(<OrbitMetric label="Дневной результат" value={48} periodStatus="open" />);
    expect(screen.getByText('48%')).toBeVisible();
    expect(screen.getByText('В процессе')).toBeVisible();
  });

  it('shows optional context and state hint copy', () => {
    render(
      <OrbitMetric
        label="Прогресс недели"
        value={70}
        periodStatus="open"
        contextLabel="Задачи и привычки недели"
        stateHint={{ label: 'Дней закрыто:', value: '2 из 7' }}
      />,
    );
    expect(screen.getByText('Задачи и привычки недели')).toBeVisible();
    expect(screen.getByText('Дней закрыто:')).toBeVisible();
    expect(screen.getByText('2 из 7')).toBeVisible();
  });

  it('announces an unavailable score without a percentage', () => {
    render(<OrbitMetric label="Дневной результат" value="unavailable" periodStatus="open" />);
    expect(screen.getByText('Пока нет данных')).toBeVisible();
    expect(screen.getByText('Недоступен')).toHaveClass('visually-hidden');
  });

  it('draws the orbital field and counts the value up when motion is allowed', () => {
    allowMotion();
    const context = stubCanvas();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    render(<OrbitMetric label="Дневной результат" value={80} periodStatus="open" />);

    expect(frames.length).toBeGreaterThan(0);
    act(() => {
      frames.splice(0).forEach((frame) => {
        frame(0);
      });
    });
    expect(context.clearRect).toHaveBeenCalled();
    expect(context.fillText).toHaveBeenCalled();
    expect(context.stroke).toHaveBeenCalled();

    // Advancing past the count-up duration settles on the real value.
    act(() => {
      frames.splice(0).forEach((frame) => {
        frame(5_000);
      });
    });
    expect(screen.getByText('80%')).toBeVisible();
  });

  it('treats an unreadable reduced-motion query as reduced', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(() => {
        throw new Error('unsupported');
      }),
    );
    render(<OrbitMetric label="Дневной результат" value={12} periodStatus="closed" />);
    expect(screen.getByText('12%')).toBeVisible();
    expect(screen.getByText('Итог сохранён')).toBeVisible();
  });
});
