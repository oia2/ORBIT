import { useEffect, useRef, useState } from 'react';

export type OrbitMetricTone = 'neutral' | 'good' | 'warning' | 'low';
export type OrbitMetricPeriodStatus = 'not-started' | 'open' | 'closed' | 'completed';

export interface OrbitMetricProps {
  /** Identity used for assistive tech only; the visible caption shows a derived status word instead. */
  readonly label: string;
  readonly value: number | 'unavailable';
  readonly tone?: OrbitMetricTone;
  /** Drives the visible status word: not started, no data, still live, or finalized. */
  readonly periodStatus: OrbitMetricPeriodStatus;
  /** Short factual context shown at the top-left of the panel. */
  readonly contextLabel?: string;
  /** Factual hint anchored bottom-right, mirroring the reference's state line. */
  readonly stateHint?: { readonly label: string; readonly value: string };
  readonly size?: 'default' | 'compact';
}

/**
 * Mirrors the Open Design status ladder: period/data states first, then the
 * score's own threshold band. Product-owner approved on 2026-08-16, replacing
 * the earlier "no textual score label" rule (see spec Session 2026-08-16).
 * Thresholds match FR-034's `>=70` / `50–69` / `<50` bands exactly.
 */
function statusWordFor(
  value: number | 'unavailable',
  periodStatus: OrbitMetricPeriodStatus,
): string {
  if (periodStatus === 'not-started') return 'Не начат';
  if (value === 'unavailable') return 'Пока нет данных';
  if (periodStatus !== 'open') return 'Итог сохранён';
  if (value >= 70) return 'Успешно';
  if (value >= 50) return 'Частично';
  return 'В процессе';
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

const FIELD_SYMBOLS = ['·', '+', '/', '%', '°', '@'] as const;

/**
 * Reproduces the Open Design orbital field: four tilted rings of monospace
 * glyphs drifting around the core, plus one accent ellipse. Canvas-based like
 * the reference, so the motion is continuous rather than a one-shot transition.
 */
function useOrbitField(paused: boolean) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (canvas === null || host === null || host === undefined) return undefined;
    const context = canvas.getContext('2d');
    if (context === null) return undefined;

    const reduced = paused || prefersReducedMotion();
    const pointer = { x: 0.5, y: 0.5 };
    let width = 1;
    let height = 1;
    let frame = 0;

    const draw = (now: number): void => {
      const styles = getComputedStyle(document.documentElement);
      const accent = styles.getPropertyValue('--accent').trim();
      const muted = styles.getPropertyValue('--muted').trim();
      const time = now * 0.00018;
      const centerX = width * (0.5 + (pointer.x - 0.5) * 0.025);
      const centerY = height * (0.5 + (pointer.y - 0.5) * 0.025);
      const compact = width < 430;

      context.clearRect(0, 0, width, height);
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = `${String(compact ? 9 : 10)}px "Cascadia Code", monospace`;

      for (let ring = 0; ring < 4; ring += 1) {
        const count = compact ? 32 + ring * 8 : 46 + ring * 12;
        const radiusX = Math.min(width * (0.18 + ring * 0.09), width * 0.46);
        const radiusY = Math.min(height * (0.1 + ring * 0.055), height * 0.31);
        const tilt = -0.28 + ring * 0.12;
        for (let index = 0; index < count; index += 1) {
          const phase = (index / count) * Math.PI * 2 + time * (ring % 2 ? -0.72 : 0.5) + ring;
          const wave = Math.sin(phase * 3 + time * 4) * (4 + ring * 1.5);
          const x0 = Math.cos(phase) * (radiusX + wave);
          const y0 = Math.sin(phase) * (radiusY + wave * 0.25);
          context.globalAlpha = 0.08 + ((Math.sin(phase) + 1) / 2) * 0.28;
          context.fillStyle = ring === 1 && index % 7 === 0 ? accent : muted;
          context.fillText(
            FIELD_SYMBOLS[(index + ring * 2) % FIELD_SYMBOLS.length] ?? '·',
            centerX + x0 * Math.cos(tilt) - y0 * Math.sin(tilt),
            centerY + x0 * Math.sin(tilt) + y0 * Math.cos(tilt),
          );
        }
      }

      context.globalAlpha = 0.16;
      context.strokeStyle = accent;
      context.lineWidth = 1;
      context.beginPath();
      context.ellipse(
        centerX,
        centerY,
        Math.min(width * 0.29, 190),
        Math.min(height * 0.17, 90),
        -0.2 + Math.sin(time) * 0.04,
        0,
        Math.PI * 2,
      );
      context.stroke();
      context.globalAlpha = 1;

      if (!reduced) frame = requestAnimationFrame(draw);
    };

    const resize = (): void => {
      const box = host.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, box.width);
      height = Math.max(1, box.height);
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${String(width)}px`;
      canvas.style.height = `${String(height)}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (reduced) draw(0);
    };

    const handlePointerMove = (event: PointerEvent): void => {
      const box = canvas.getBoundingClientRect();
      pointer.x = (event.clientX - box.left) / box.width;
      pointer.y = (event.clientY - box.top) / box.height;
    };
    const handlePointerLeave = (): void => {
      pointer.x = 0.5;
      pointer.y = 0.5;
    };

    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : undefined;
    observer?.observe(host);
    host.addEventListener('pointermove', handlePointerMove);
    host.addEventListener('pointerleave', handlePointerLeave);
    resize();
    if (!reduced) frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      host.removeEventListener('pointermove', handlePointerMove);
      host.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [paused]);

  return canvasRef;
}

/** Counts the ring's value up from its previous value instead of snapping to the new one. */
function useAnimatedValue(target: number | 'unavailable'): number | 'unavailable' {
  const [display, setDisplay] = useState(target);
  const lastNumeric = useRef<number>(typeof target === 'number' ? target : 0);

  useEffect(() => {
    if (target === 'unavailable') {
      setDisplay('unavailable');
      return undefined;
    }
    if (typeof window.requestAnimationFrame !== 'function' || prefersReducedMotion()) {
      setDisplay(target);
      lastNumeric.current = target;
      return undefined;
    }

    const from = lastNumeric.current;
    const duration = 700;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(from + (target - from) * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        lastNumeric.current = target;
      }
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [target]);

  return display;
}

export function OrbitMetric({
  label,
  value,
  tone = 'neutral',
  periodStatus,
  contextLabel,
  stateHint,
  size = 'default',
}: OrbitMetricProps) {
  const statusWord = statusWordFor(value, periodStatus);
  const displayValue = useAnimatedValue(value);
  const canvasRef = useOrbitField(value === 'unavailable');

  return (
    <figure
      className="orbit-metric"
      data-tone={tone}
      data-size={size}
      data-od-id="orbit-metric"
      aria-label={label}
    >
      <canvas className="orbit-metric__canvas" ref={canvasRef} aria-hidden="true" />
      {contextLabel === undefined ? null : <p className="orbit-metric__context">{contextLabel}</p>}
      <div className="orbit-metric__core">
        <span className="orbit-metric__value">
          {displayValue === 'unavailable' ? (
            <>
              <span aria-hidden="true">—</span>
              <span className="visually-hidden">Недоступен</span>
            </>
          ) : (
            `${String(displayValue)}%`
          )}
        </span>
        <figcaption className="orbit-metric__label">{statusWord}</figcaption>
      </div>
      {stateHint === undefined ? null : (
        <p className="orbit-metric__state">
          <span className="orbit-metric__signal" aria-hidden="true" />
          <span>
            {stateHint.label} <strong>{stateHint.value}</strong>
          </span>
        </p>
      )}
    </figure>
  );
}
