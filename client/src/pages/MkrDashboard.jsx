import { useEffect, useState } from 'react';
import { api } from '../api';
import { Stage } from '../ui.jsx';

export default function MkrDashboard() {
  const [d, setD] = useState(null);
  const [names, setNames] = useState({});
  useEffect(() => {
    api.get('/api/mkr/dashboard').then(setD).catch(e => console.error(e));
    api.get('/api/mkr/rating').then(rs => setNames(Object.fromEntries(rs.map(r => [r.userId, r.fullName])))).catch(() => {});
  }, []);
  if (!d) return <p className="muted">Загрузка…</p>;

  const max = Math.max(1, ...Object.values(d.funnel));
  const movers = (d.dynamics || []).filter(x => x.deltaScore != null && x.deltaScore !== 0)
    .sort((a, b) => b.deltaScore - a.deltaScore).slice(0, 5);

  return (
    <div className="cols">
      <section className="card">
        <h2>Воронка резерва</h2>
        {['Участник', 'Кандидат', 'Резидент'].map(s => (
          <div key={s} className="funnel-row">
            <span>{s}</span>
            <div className="bar"><div className="bar-fill" style={{ width: `${(d.funnel[s] / max) * 100}%`, background: s === 'Резидент' ? '#0d7a3f' : s === 'Кандидат' ? '#b58900' : '#6b7280' }} /></div>
            <b>{d.funnel[s]}</b>
          </div>
        ))}
      </section>
      <section className="card counters">
        <h2>Показатели</h2>
        <div className="counter"><b>{d.counters.members}</b><span>обучающихся в контуре</span></div>
        <div className="counter"><b>{d.counters.pendingVerifications}</b><span>заявок на верификации</span></div>
        <div className="counter"><b>{d.counters.approvedAchievements}</b><span>зачтённых достижений</span></div>
      </section>

      <section className="card">
        <h2>Динамика рейтинга</h2>
        {!d.hasBaseline && <p className="muted">Базовый снимок сделан — сравнение появится при следующем открытии дашборда.</p>}
        {!!movers.length && (
          <table>
            <thead><tr><th>ФИО</th><th>Δ баллов</th><th>Δ места</th></tr></thead>
            <tbody>
              {movers.map(x => (
                <tr key={x.userId}>
                  <td>{names[x.userId] || `#${x.userId}`}</td>
                  <td className={x.deltaScore > 0 ? 'delta-up' : 'delta-down'}>{x.deltaScore > 0 ? `+${x.deltaScore}` : x.deltaScore}</td>
                  <td>{x.deltaRank == null ? '—' : x.deltaRank > 0 ? `▲ ${x.deltaRank}` : x.deltaRank < 0 ? `▼ ${-x.deltaRank}` : '='}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Последние решения Совета</h2>
        {!d.decisions?.length && <p className="muted">Решений пока нет.</p>}
        <ul className="ach-list">
          {(d.decisions || []).map(x => (
            <li key={x.userId}>{x.fullName} — <Stage stage={x.stage} /> <small className="muted">{x.councilNote || ''} · {x.decidedAt} UTC</small></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
