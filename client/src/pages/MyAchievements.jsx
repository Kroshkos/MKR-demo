import { useEffect, useState } from 'react';
import { api } from '../api';
import { Stage, StageProgress } from '../ui.jsx';

const LEVELS = [['межд', 'Международный'], ['всеросс', 'Всероссийский'], ['регион', 'Региональный'], ['вуз', 'Уровень вуза']];
const STATUSES = [['победитель', 'Победитель'], ['призёр', 'Призёр'], ['дипломант', 'Дипломант'], ['участник', 'Участник']];
const STATE_BADGE = { draft: ['#9ca3af', 'Черновик'], submitted: ['#1d4ed8', 'На верификации'], in_review: ['#b58900', 'Проверяется'], approved: ['#0d7a3f', 'Зачтено'], rejected: ['#b91c1c', 'Отклонено'], revision: ['#7c3aed', 'На доработку'] };

export default function MyAchievements() {
  const [data, setData] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [form, setForm] = useState({ catalogId: '', level: 'вуз', status: 'участник', isTeam: false, eventDate: new Date().toISOString().slice(0, 10), docName: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('all');

  const load = () => api.get('/api/me/achievements').then(setData);
  useEffect(() => {
    load();
    api.get('/api/catalog').then(setCatalog);
  }, []);

  const save = async (submit) => {
    setErr(''); setMsg('');
    try {
      await api.post('/api/achievements', { ...form, catalogId: Number(form.catalogId), submit });
      setMsg(submit ? 'Отправлено на верификацию' : 'Черновик сохранён');
      await load();
    } catch (e) { setErr(e.message); }
  };

  const resubmit = async (id) => {
    setErr('');
    try { await api.post(`/api/achievements/${id}/submit`); await load(); }
    catch (e) { setErr(e.message); }
  };

  if (!data) return <p className="muted">Загрузка…</p>;
  const cat = catalog.find(c => String(c.id) === String(form.catalogId));
  const shown = filter === 'all' ? data.achievements : data.achievements.filter(a => a.verifyState === filter);
  const cnt = (st) => data.achievements.filter(a => a.verifyState === st).length;

  return (
    <div className="cols">
      <section className="card">
        <h2>Новое достижение</h2>
        <label>Позиция каталога
          <select value={form.catalogId} onChange={e => setForm({ ...form, catalogId: e.target.value })}>
            <option value="">— выберите —</option>
            {catalog.map(c => <option key={c.id} value={c.id}>{c.name} (блок «{c.blockCode}», база {c.baseScore})</option>)}
          </select>
        </label>
        <div className="row">
          <label>Уровень
            <select value={form.level} onChange={e => setForm({ ...form, level: e.target.value })}>
              {LEVELS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </label>
          <label>Статус
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </label>
        </div>
        <div className="row">
          <label>Дата мероприятия
            <input type="date" value={form.eventDate} onChange={e => setForm({ ...form, eventDate: e.target.value })} />
          </label>
          <label>Название документа (грамота, приказ и т.п.)
            <input placeholder="Напр.: Грамота организаторов конференции" value={form.docName} onChange={e => setForm({ ...form, docName: e.target.value })} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={form.isTeam} onChange={e => setForm({ ...form, isTeam: e.target.checked })} />
          Коллективная работа (×0.7)
        </label>
        {cat && <p className="muted">Кп по умолчанию: {cat.defaultKp}. Предварительный балл будет рассчитан после сохранения.</p>}
        {err && <div className="error">{err}</div>}
        {msg && <div className="ok">{msg}</div>}
        <div className="row">
          <button className="btn ghost" disabled={!form.catalogId} onClick={() => save(false)}>Сохранить черновик</button>
          <button className="btn primary" disabled={!form.catalogId} onClick={() => save(true)}>Подать на верификацию</button>
        </div>
      </section>

      <section className="card wide">
        <h2>Мои достижения · <Stage stage={data.myStage} /> · {data.myTotal} баллов</h2>
        <StageProgress total={data.myTotal} stage={data.myStage} thresholds={data.thresholds} />
        <div className="filters" style={{ marginTop: 10 }}>
          {[['all','Все'], ['draft','Черновики'], ['submitted','На верификации'], ['approved','Зачтено'], ['revision','На доработку'], ['rejected','Отклонено']].map(([v,t]) => (
            <button key={v} className={`fchip ${filter===v?'on':''}`} onClick={()=>setFilter(v)}>{t}{v!=='all'?` (${cnt(v)})`:''}</button>
          ))}
        </div>
        <table>
          <thead><tr><th>Событие</th><th>Блок</th><th>Уровень/статус</th><th>Балл</th><th>Состояние</th><th /></tr></thead>
          <tbody>
            {shown.map(a => {
              const [color, label] = STATE_BADGE[a.verifyState] || ['#666', a.verifyState];
              return (
                <tr key={a.id}>
                  <td>{a.catalogName}{a.isTeam ? ' 👥' : ''}<br /><small className="muted">{a.eventDate}{a.docName ? ` · 📎 ${a.docName}` : ''}</small></td>
                  <td>{a.blockName}</td>
                  <td>{a.level} / {a.status}</td>
                  <td><b>{a.computedScore}</b></td>
                  <td><span className="badge" style={{ background: color }}>{label}</span>
                    {a.verifierComment && <small className="muted"> — {a.verifierComment}</small>}</td>
                  <td>{['draft', 'revision'].includes(a.verifyState) &&
                    <button className="btn small" onClick={() => resubmit(a.id)}>Подать</button>}</td>
                </tr>
              );
            })}
            {!shown.length && <tr><td colSpan="6" className="muted">Пока пусто — добавьте первое достижение.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
