export type OrbitMetricTone = 'neutral' | 'good' | 'warning' | 'low';

export interface OrbitMetricProps {
  readonly label: string;
  readonly value: number | 'unavailable';
  readonly tone?: OrbitMetricTone;
  readonly description: string;
  readonly size?: 'default' | 'compact';
}

export function OrbitMetric({
  label,
  value,
  tone = 'neutral',
  description,
  size = 'default',
}: OrbitMetricProps) {
  return (
    <figure
      className="orbit-metric"
      data-tone={tone}
      data-size={size}
      data-od-id="orbit-metric"
      aria-label={label}
    >
      <span className="orbit-metric__field" aria-hidden="true" />
      <div className="orbit-metric__core">
        <span className="orbit-metric__value">
          {value === 'unavailable' ? (
            <>
              <span aria-hidden="true">—</span>
              <span className="visually-hidden">Недоступен</span>
            </>
          ) : (
            `${String(value)}%`
          )}
        </span>
        <figcaption className="orbit-metric__label">{label}</figcaption>
      </div>
      <p className="orbit-metric__description">{description}</p>
    </figure>
  );
}
