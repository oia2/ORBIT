import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { buildScoreBreakdown } from '../../../../tests/fixtures/planning';

import { ScoreBreakdown } from './ScoreBreakdown';

afterEach(cleanup);

describe('ScoreBreakdown', () => {
  it.each([
    [85, 'good'],
    [60, 'warning'],
    [40, 'low'],
  ] as const)('uses the approved non-text semantic tone for %s', (value, tone) => {
    render(
      <ScoreBreakdown
        score={buildScoreBreakdown({ value })}
        label="Дневной результат"
        periodStatus="open"
        semantic
      />,
    );
    const region = screen.getByRole('region', { name: /дневной результат/i });
    expect(region).toHaveAttribute('data-score-tone', tone);
    expect(region).toHaveTextContent(`${String(value)}%`);
    // 003 FR-020: the explainer describes one weight per item, never a 70/30 split.
    expect(region).toHaveTextContent(/весят одинаково/i);
    expect(region).not.toHaveTextContent(/70%|30%/);
  });

  it('keeps weekly and unavailable scores neutral with explicit missing data', () => {
    render(
      <ScoreBreakdown
        score={buildScoreBreakdown({
          value: 'unavailable',
          task: { completed: 0, applicable: 0, rate: 'unavailable' },
          habit: { completed: 0, applicable: 0, rate: 'unavailable' },
        })}
        label="Прогресс недели"
        periodStatus="open"
      />,
    );
    const region = screen.getByRole('region', { name: /прогресс недели/i });
    expect(region).toHaveAttribute('data-score-tone', 'neutral');
    expect(region).toHaveTextContent(/недоступен.*нет данных/is);
  });
});
