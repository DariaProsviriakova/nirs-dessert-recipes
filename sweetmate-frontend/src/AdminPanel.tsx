import { useEffect, useState } from 'react';
import { api } from './api';
type Stats = {
  requests: number; noResults: number; catalogSize: number;
  byDay: { date: string; count: number }[];
  popular: { id: string; title: string; requestCount: number }[];
  period: { from: string; to: string; days: number; timeZone: string };
  services: { search: string; llm: string };
};
export function AdminPanel({ demo = false }: { demo?: boolean }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => {
      if (document.hidden) return;
      api<Stats>('/admin/stats', { signal: controller.signal }).then(value => {
        setStats(value); setError('');
      }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    };
    refresh();
    const timer = window.setInterval(refresh, 10000);
    document.addEventListener('visibilitychange', refresh);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return <section className="admin-panel" aria-labelledby="admin-title">
    <header className="admin-header"><div><p className="admin-eyebrow">Окно администратора</p>
      <h1 id="admin-title">Обзор</h1><p>{demo ? 'Тестовый обзор каталога и запросов этого демо-сеанса.' : 'Агрегированная статистика поиска SweetMate.'}</p></div>
      <span className="admin-demo-badge">{demo ? 'Демо-режим · только просмотр' : 'Только просмотр'}</span></header>
    {error && <p role="alert" className="form-error">{error} Последние показатели могут быть неактуальны.</p>}
    {!stats ? <p role="status">Загружаем статистику…</p> : <>
      <p className="admin-privacy-note">Период: {new Date(stats.period.from).toLocaleDateString('ru-RU')} — {new Date(stats.period.to).toLocaleDateString('ru-RU')}; последние {stats.period.days} дней. Группировка дней: UTC.</p>
      <div className="admin-metrics">
        <article className="admin-metric"><span>Рецептов в каталоге</span><strong>{stats.catalogSize.toLocaleString('ru-RU')}</strong><small>Индекс BM25</small></article>
        <article className="admin-metric"><span>Общие запросы</span><strong>{stats.requests}</strong><small>За указанный период</small></article>
        <article className="admin-metric"><span>Без результатов</span><strong>{stats.noResults}</strong><small>Пустая выдача</small></article>
        <article className="admin-metric"><span>LLM</span><strong>{stats.services.llm === 'configured' ? 'Настроена' : 'Без ключа'}</strong><small>Карточки доступны независимо от LLM</small></article>
      </div>
      <div className="admin-content-grid">
        <section className="admin-section"><h2>Популярные рецепты</h2>
          <p>Число попаданий в выдачу за указанный период.</p>
          {!stats.popular.length && <p>Поисковых данных пока нет.</p>}
          {stats.popular.map((r, i) => <div className="admin-recipe-row" key={r.id}>
            <span className="admin-recipe-rank">{i + 1}</span><div className="admin-recipe-info">
              <strong>{r.title}</strong><span>{r.requestCount} попаданий</span></div></div>)}
        </section>
        <section className="admin-section"><h2>Запросы по дням</h2>
          {!stats.byDay.length && <p>Поисковых данных пока нет.</p>}
          <dl className="admin-status-list">{stats.byDay.map(day => <div key={day.date}><dt>{day.date}</dt><dd>{day.count}</dd></div>)}</dl>
        </section>
      </div>
      <p className="admin-privacy-note">Личные переписки, тексты запросов, email и избранное пользователей здесь не отображаются. Поиск: {stats.services.search === 'ready' ? 'доступен' : 'недоступен'}.</p>
    </>}
  </section>;
}
