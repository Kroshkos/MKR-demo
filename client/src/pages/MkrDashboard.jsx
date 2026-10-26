import { useEffect, useState } from 'react';
import { api } from '../api';

export default function MkrDashboard() {
  const [d, setD] = useState(null);
  useEffect(() => { api.get('/api/mkr/dashboard').then(setD); }, []);
  if (!d) return <p className="muted">Загрузка…</p>;

  const max = Math.max(1, ...Object.values(d.funnel));
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
    </div>
  );
}
