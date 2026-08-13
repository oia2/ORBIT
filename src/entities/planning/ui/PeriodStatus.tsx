export interface PeriodStatusProps {
  readonly status: 'open' | 'closed' | 'completed';
}

export function PeriodStatus({ status }: PeriodStatusProps) {
  const label = status === 'open' ? 'Открыт' : status === 'closed' ? 'Закрыт' : 'Завершён';
  return (
    <span className="orbit-period-status" data-status={status} aria-label={`Статус: ${label}`}>
      {label}
    </span>
  );
}
