import { useEffect, useState } from 'react';
import { api } from '../api';
import { Stage } from '../ui.jsx';
import { PassportView } from './MyPassport.jsx';

const CAN_WRITE = ['mkr_admin', 'owner'];

export default function MkrRating({ role }) {
  const [rows, setRows] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [passport, setPassport] = useState(null);
  const [res, setRes] = useState({ stage: '', councilNote: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => { api.get('/api/mkr/rating').then(setRows); }, []);
  useEffect(() => {
    if (openId == null) { setPassport(null); return; }
    api.get(`/api/mkr/passport/${openId}`).then(p => { setPassport(p); setRes({ stage: p.reserve?.stage || '', councilNote: p.reserve?.councilNote || '' }); });
  }, [openId]);

  const saveDecision = async () => {
    setMsg('');
    try {
      await api.post(`/api/mkr/reserve/${openId}`, { stage: res.stage, councilNote: res.councilNote });
      setMsg('Решение Совета зафиксировано');
      const p = await api.get(`/api/mkr/passport/${openId}`); setPassport(p);
      const rs = await api.get('/api/mkr/rating'); setRows(rs);
    } catch (e) { setMsg(e.message); }
  };

  if (!rows) return <p className="muted">Загрузка…</p>;

  return (
    <div>
      <div className="toolbar">
        <h2>Сводный рейтинг · {rows.length} обучающихся</h2>
        <a className="btn ghost" href="/api/mkr/rating?format=csv" target="_blank" rel="noreferrer">Выгрузить CSV</a>
      </div>
      <section className="card wide">
        <table>
          <thead><tr><th>#</th><th>ФИО</th><th>Трек/курс</th><th>Баллы</th><th>Этап</th><th>ИУ</th><th>ИШ</th><th>Кг</th><th>Профиль</th><th /></tr></thead>
          <tbody>
            {rows.map((x, i) => (
              <tr key={x.userId} className={openId === x.userId ? 'active' : ''}>
                <td>{i + 1}</td>
                <td>{x.fullName}</td>
                <td>{x.track} · {x.course} курс</td>
                <td><b>{x.total}</b></td>
                <td><Stage stage={x.stage} />{x.councilNote && <small className="muted"> ✎</small>}</td>
                <td>{x.iu}%</td><td>{x.ish}%</td><td>{x.kg}</td>
                <td>{x.dominantProfile}</td>
                <td><button className="btn small" onClick={() => setOpenId(openId === x.userId ? null : x.userId)}>
                  {openId === x.userId ? 'Свернуть' : 'Паспорт'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {openId != null && passport && (
        <section className="card open-passport">
          <h2>Паспорт: {passport.user.fullName}</h2>
          <PassportView p={passport} />
          <h3>Зачтённые достижения</h3>
          <ul className="ach-list">
            {passport.achievements.map((a, i) => <li key={i}>{a.name} — {a.level}/{a.status} · <b>{a.score}</b> (блок {a.block})</li>)}
            {!passport.achievements.length && <li className="muted">Нет зачтённых достижений.</li>}
          </ul>
          {CAN_WRITE.includes(role) && (
            <div className="decision">
              <h3>Решение Совета МКР</h3>
              <div className="row">
                <label>Этап
                  <select value={res.stage} onChange={e => setRes({ ...res, stage: e.target.value })}>
                    <option value="">— не задан (авто по баллам) —</option>
                    <option>Участник</option><option>Кандидат</option><option>Резидент</option>
                  </select>
                </label>
                <label className="grow">Примечание
                  <input value={res.councilNote} onChange={e => setRes({ ...res, councilNote: e.target.value })} placeholder="Протокол Совета №… от…" />
                </label>
                <button className="btn primary" disabled={!res.stage} onClick={saveDecision}>Зафиксировать</button>
              </div>
              {msg && <div className="ok">{msg}</div>}
              {passport.reserve?.decidedBy && <p className="muted">Последнее решение: «{passport.reserve.stage}» — {passport.reserve.decidedBy}, {passport.reserve.decidedAt}</p>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
