import { useEffect, useState } from 'react';
import { api } from '../api';

const LEVELS = ['межд', 'всеросс', 'регион', 'вуз'];
const STATUSES = ['победитель', 'призёр', 'дипломант', 'участник'];

export default function VerifyQueue() {
  const [rows, setRows] = useState(null);
  const [stateF, setStateF] = useState('all');
  const [err, setErr] = useState('');
  const [sel, setSel] = useState(null); // выбранная заявка для решения
  const [dec, setDec] = useState({ decision: 'approve', comment: '', level: '', status: '', kp: '' });

  const load = () => api.get('/api/verify/queue').then(setRows).catch(e => setErr(e.message));
  useEffect(() => { load(); }, []);

  const open = (a) => { setSel(a); setDec({ decision: 'approve', comment: '', level: a.level, status: a.status, kp: a.kp }); };

  const take = async (a) => {
    setErr('');
    try { await api.post(`/api/verify/${a.id}/take`); await load(); }
    catch (e) { setErr(e.message); }
  };

  const decide = async () => {
    setErr('');
    try {
      await api.post(`/api/verify/${sel.id}`, {
        decision: dec.decision, comment: dec.comment,
        level: dec.level || undefined, status: dec.status || undefined,
        kp: dec.kp === '' ? undefined : Number(dec.kp),
      });
      setSel(null); await load();
    } catch (e) { setErr(e.message); }
  };

  if (!rows) return <p className="muted">Загрузка…</p>;
  const shown = stateF === 'all' ? rows : rows.filter(a => a.verifyState === stateF);
  const nNew = rows.filter(a => a.verifyState === 'submitted').length;
  const nWork = rows.filter(a => a.verifyState === 'in_review').length;

  return (
    <div className="cols">
      <section className="card wide">
        <h2>Очередь верификации · {rows.length} заявок</h2>
        <div className="filters">
          {[['all', `Все (${rows.length})`], ['submitted', `Новые (${nNew})`], ['in_review', `В работе (${nWork})`]].map(([v, t]) => (
            <button key={v} className={`fchip ${stateF === v ? 'on' : ''}`} onClick={() => setStateF(v)}>{t}</button>
          ))}
        </div>
        {err && <div className="error">{err}</div>}
        <table>
          <thead><tr><th>Заявитель</th><th>Событие</th><th>Блок</th><th>Уровень/статус</th><th>Балл</th><th>Состояние</th><th /></tr></thead>
          <tbody>
            {shown.map(a => (
              <tr key={a.id}>
                <td>{a.applicant}</td>
                <td>{a.catalogName}<br /><small className="muted">{a.eventDate} · {a.docUrl ? <a href={a.docUrl} target="_blank" rel="noreferrer">документ ↗</a> : 'без документа'}</small></td>
                <td>{a.blockName}</td>
                <td>{a.level} / {a.status} · Кп {a.kp}{a.isTeam ? ' · 👥' : ''}</td>
                <td><b>{a.computedScore}</b></td>
                <td>{a.verifyState === 'submitted' ? 'Новая' : 'В работе'}</td>
                <td className="row">
                  {a.verifyState === 'submitted' && <button className="btn small ghost" onClick={() => take(a)}>В работу</button>}
                  <button className="btn small primary" onClick={() => open(a)}>Проверить</button>
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan="7" className="muted">Очередь пуста — заявки по блокам вашего отдела обработаны.</td></tr>}
          </tbody>
        </table>
      </section>

      {sel && (
        <section className="card modal-card">
          <h2>Решение по заявке</h2>
          <p><b>{sel.applicant}</b> — {sel.catalogName}<br />
            <small className="muted">Текущий расчёт: {sel.computedScore} баллов (уровень {sel.level}, статус {sel.status}, Кп {sel.kp})</small></p>
          <label>Решение
            <select value={dec.decision} onChange={e => setDec({ ...dec, decision: e.target.value })}>
              <option value="approve">Зачесть (approve)</option>
              <option value="revision">На доработку (revision)</option>
              <option value="reject">Отклонить (reject)</option>
            </select>
          </label>
          {dec.decision === 'approve' && (
            <div className="row">
              <label>Скорр. уровень
                <select value={dec.level} onChange={e => setDec({ ...dec, level: e.target.value })}>
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <label>Скорр. статус
                <select value={dec.status} onChange={e => setDec({ ...dec, status: e.target.value })}>
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label>Скорр. Кп
                <input type="number" step="0.1" min="0.5" max="1.5" value={dec.kp} onChange={e => setDec({ ...dec, kp: e.target.value })} />
              </label>
            </div>
          )}
          <label>Комментарий
            <textarea rows="3" value={dec.comment} onChange={e => setDec({ ...dec, comment: e.target.value })}
              placeholder={dec.decision === 'approve' ? 'Основание зачёта (номер приказа/грамоты)…' : 'Причина / что доработать…'} />
          </label>
          <div className="row">
            <button className="btn primary" onClick={decide}>Принять решение</button>
            <button className="btn ghost" onClick={() => setSel(null)}>Отмена</button>
          </div>
        </section>
      )}
    </div>
  );
}
