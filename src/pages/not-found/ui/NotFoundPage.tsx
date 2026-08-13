import { Link } from 'react-router';

export interface NotFoundPageProps {
  readonly currentWeekPath: string;
}

export function NotFoundPage({ currentWeekPath }: NotFoundPageProps) {
  return (
    <section className="orbit-empty-state orbit-card" aria-labelledby="not-found-title">
      <p className="orbit-eyebrow">ORBIT / 404</p>
      <h1 className="orbit-page-title" id="not-found-title">
        Страница не найдена
      </h1>
      <p className="orbit-page-note">Проверьте адрес или вернитесь к текущему периоду.</p>
      <Link className="orbit-button" to={currentWeekPath}>
        Вернуться к текущей неделе
      </Link>
    </section>
  );
}
