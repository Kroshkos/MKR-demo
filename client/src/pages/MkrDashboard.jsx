import { useEffect, useState } from 'react';
import { api } from '../api';
import { Stage, Skeleton } from '../ui.jsx';

export default function MkrDashboard() {
  const [d, setD] = useState(null);
  const [names, setNames] = useState({});
  useEffect(() => {
    api.get('/api/mkr/dashboard').then(setD).catch(e => console.error(e));
    api.get('/api/mkr/rating').then(rs => setNames(Object.fromEntries(rs.map(r => [r.userId, r.fullName])))).catch(() => {});
  }, []);
  if (!d) return (
    <div className="cols">
      {[...Array(4)].map((_, i) => <section key={i} className="card"><Skeleton h={26} w="50%" style={{ marginBottom: 14 }} /><Skeleton h={14} /><Skeleton h={14} style={{ margin: '10px 0' }} /><Skeleton h={14} w="70%" /></section>)}
    </div>
  );

  const max = Math.max(1, ...Object.values(d.funnel));
  const movers = (d.dynamics || []).filter(x => x.deltaScore != null && x.deltaScore !== 0)
    .sort((a, b) => b.deltaScore - a.deltaScore).slice(0, 5);
  const feed = d.councilFeed || [];

  return (
    <div className="cols">
      <div className="hero" style={{ gridColumn: '1/-1' }}>
        <div className="kpi"><b>{d.counters.members}</b><span>обучающихся в контуре</span><i className="spark">👥</i></div>
        <div className="kpi c2"><b>{d.funnel.Резидент ?? 0}</b><span>резидентов МКР</span><i className="spark">🏆</i></div>
        <div className="kpi c3"><b>{d.counters.pendingVerifications}</b><span>заявок на верификации</span><i className="spark">⏳</i></div>
        <div className="kpi c4"><b>{d.counters.approvedAchievements}</b><span>зачтённых достижений</span><i className="spark">✅</i></div>
      </div>

      <section className="card">
        <h2>Воронка резерва</h2>
        {['Участник', 'Кандидат', 'Резидент'].map(s => (
          <div key={s} className="funnel-row">
            <span>{s}</span>
            <div className="bar"><div className="bar-fill" style={{ width: `${(d.funnel[s] / max) * 100}%` }} /></div>
            <b>{d.funnel[s]}</b>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Динамика рейтинга</h2>
        {!movers.length && <p className="muted">{d.hasBaseline ? 'Изменений с прошлого снимка нет.' : 'Базовый снимок сделан — сравнение появится при следующем открытии дашборда.'}</p>}
        {!!movers.length && (
          <table>
            <tbody>
              {movers.map(m => (
                <tr key={m.userId}>
                  <td>{names[m.userId] || `№${m.userId}`}</td>
                  <td className={m.deltaScore > 0 ? 'delta-up' : 'delta-down'}>
                    {m.deltaScore > 0 ? '▲' : '▼'} {Math.abs(Math.round(m.deltaScore * 10) / 10)} б.
                  </td>
                  <td className="muted">{m.totalScore} б. · <Stage stage={m.stage} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card wide">
        <h2>Лента решений Совета</h2>
        {!feed.length && <p className="muted">Решений пока нет.</p>}
        {!!feed.length && (
          <ul className="feed">
            {feed.map((f, i) => (
              <li key={i}>
                <b>{f.action}</b> — {names[f.userId] || `обучающийся №${f.userId}`}
                {f.note && <div className="muted">{f.note}</div>}
                <time>{f.createdAt} UTC · {f.by}</time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
