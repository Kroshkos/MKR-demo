import { useEffect, useState } from 'react';
import { api } from '../api';
import { Stage, Radar, Bar } from '../ui.jsx';

// Универсальный компонент паспорта: используется и для «моего паспорта» (member),
// и для паспорта резервиста в контуре Б.
export function PassportView({ p }) {
  if (!p) return <p className="muted">Загрузка…</p>;
  return (
    <div className="passport">
      <div className="card summary">
        <h2>Паспорт резервиста</h2>
        <div className="big-score">{p.total}<small> баллов</small></div>
        <Stage stage={p.stage} />
        <div className="indices">
          <div><b>{p.iu}%</b><span>ИУ — углублённость (Кп ≥ 1.2)</span></div>
          <div><b>{p.ish}%</b><span>ИШ — широта (Кп ≤ 1.0)</span></div>
          <div><b>{p.kg}</b><span>Кг — коэффициент глубины</span></div>
        </div>
      </div>
      <div className="card">
        <h3>Профильность (9 блоков активности)</h3>
        <Radar data={(p.radar || p.byBlock).map(b => ({ ...b, block: b.block ?? b.code }))} />
        <ul className="legend">
          {(p.radar || p.byBlock).map(b => <li key={b.block}>{b.name || `Блок ${b.block}`}: <b>{b.points}</b> / потолок {b.ceiling ?? '—'}</li>)}
        </ul>
      </div>
      <div className="card">
        <h3>Вектор профилей МПМК</h3>
        {(p.profileVectorNamed || p.profileVector).map(v => (
          <div key={v.code || v.profile} className="vec-row">
            <span className="vec-name">{v.name || v.code || v.profile}</span>
            <Bar pct={v.pct} /><span className="vec-pct">{v.pct}% · {v.points}</span>
          </div>
        ))}
        {!p.profileVector?.length && !p.profileVectorNamed?.length && <p className="muted">Нет зачтённых достижений.</p>}
      </div>
    </div>
  );
}

export default function MyPassport() {
  const [p, setP] = useState(null);
  useEffect(() => { api.get('/api/me/passport').then(setP); }, []);
  return <PassportView p={p} />;
}
