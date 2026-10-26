import { useEffect, useState } from 'react';
import { api } from '../api';
import { Stage, Radar, Bar, StageProgress, Skeleton } from '../ui.jsx';

// Универсальный компонент паспорта: «мой паспорт» (member) и паспорт резервиста (контур Б).
export function PassportView({ p, canEditPlan, canEditRecordRole, userId }) {
  if (!p) return (<div className="cols">{[...Array(3)].map((_, i) => <section key={i} className="card"><Skeleton h={22} w="40%" style={{ marginBottom: 14 }} /><Skeleton h={14} /><Skeleton h={14} style={{ margin: "10px 0" }} /><Skeleton h={14} w="65%" /></section>)}<section className="card" style={{ minHeight: 340 }}><Skeleton h={300} r={16} /></section></div>);
  return (
    <div className="passport">
      <div className="card summary">
        <h2>Паспорт резервиста</h2>
        <div className="big-score">{p.total}<small> баллов</small></div>
        <Stage stage={p.stage} />
        <StageProgress total={p.total} stage={p.stage} thresholds={p.thresholds || GLOBAL_T} />
        <div className="indices">
          <div><b>{p.iu}%</b><span>ИУ — углублённость (Кп ≥ 1.2)</span></div>
          <div><b>{p.ish}%</b><span>ИШ — широта (Кп ≤ 1.0)</span></div>
          <div><b>{p.kg}</b><span>Кг — коэффициент глубины</span></div>
        </div>
        {p.reserveFixed?.councilNote && (
          <p className="muted" style={{ marginTop: 10 }}>🏛️ {p.reserveFixed.councilNote}</p>
        )}
      </div>
      <div className="card">
        <h3>Профильность (блоки активности)</h3>
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
      <PlanCard plan={p.plan} canEdit={canEditPlan} userId={userId} />
      {p.records !== undefined && <PersonalFile records={p.records} canEdit={canEditRecordRole} userId={userId} anon={userId == null} />}
    </div>
  );
}

const GLOBAL_T = { candidate: 150, resident: 250 };

function PlanCard({ plan, canEdit, userId }) {
  const [goals, setGoals] = useState(plan?.goals || []);
  const [mentor, setMentor] = useState(plan?.mentor || '');
  const [focus, setFocus] = useState(plan?.focus || '');
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => { setGoals(plan?.goals || []); setMentor(plan?.mentor || ''); setFocus(plan?.focus || ''); }, [plan]);

  const save = async () => {
    setMsg('');
    try {
      await api.put(`/api/mkr/plan/${userId}`, { goals, mentor, focus });
      setMsg('План сохранён'); setTimeout(() => setMsg(''), 2500);
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div className="card">
      <h3>Личный план развития</h3>
      {!canEdit && !goals.length && <p className="muted">Наставник ещё не сформировал план.</p>}
      {goals.map((g, i) => (
        canEdit ? (
          <div key={i} className="goal-edit-row">
            <input value={g.text} onChange={e => setGoals(goals.map((x, k) => k === i ? { ...x, text: e.target.value } : x))} />
            <button className={`btn small ${g.done ? '' : 'ghost'}`} onClick={() => setGoals(goals.map((x, k) => k === i ? { ...x, done: !x.done } : x))}>{g.done ? '✓' : '○'}</button>
            <button className="btn small ghost" onClick={() => setGoals(goals.filter((_, k) => k !== i))}>✕</button>
          </div>
        ) : (
          <div key={i} className={`plan-goal ${g.done ? 'done' : ''}`}><span>{g.done ? '✅' : '⬜'} {g.text}</span></div>
        )
      ))}
      {canEdit && (
        <>
          <div className="goal-edit-row">
            <input placeholder="Новая цель…" value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) { setGoals([...goals, { text: draft.trim(), done: false }]); setDraft(''); } }} />
            <button className="btn small" onClick={() => { if (draft.trim()) { setGoals([...goals, { text: draft.trim(), done: false }]); setDraft(''); } }}>+</button>
          </div>
          <div className="row">
            <label>Наставник<input value={mentor} onChange={e => setMentor(e.target.value)} /></label>
            <label className="grow">Фокус развития<input value={focus} onChange={e => setFocus(e.target.value)} /></label>
          </div>
          <button className="btn primary" onClick={save}>Сохранить план</button>
          {msg && <div className="ok">{msg}</div>}
        </>
      )}
      {!canEdit && (plan?.mentor || plan?.focus) && (
        <p className="muted" style={{ marginTop: 8 }}>Наставник: <b>{plan.mentor || '—'}</b>{plan.focus ? <> · Фокус: <b>{plan.focus}</b></> : null}{plan.updatedAt ? <> · обновлён {plan.updatedAt}</> : null}</p>
      )}
    </div>
  );
}

export default function MyPassport() {
  const [p, setP] = useState(null);
  useEffect(() => { api.get('/api/me/passport').then(setP); }, []);
  if (!p) return (<div className="cols">{[...Array(3)].map((_, i) => <section key={i} className="card"><Skeleton h={22} w="40%" style={{ marginBottom: 14 }} /><Skeleton h={14} /><Skeleton h={14} style={{ margin: "10px 0" }} /><Skeleton h={14} w="65%" /></section>)}<section className="card" style={{ minHeight: 340 }}><Skeleton h={300} r={16} /></section></div>);
  return (
    <div>
      <h2>Мой паспорт резервиста</h2>
      <p className="muted">Аккаунт обучающегося анонимен: ФИО и место прикрепления документов в кабинете не отображаются.</p>
      <PassportView p={p} />
      {p.achievements?.length > 0 && (
        <section className="card wide" style={{ marginTop: 14 }}>
          <h3>Зачтённые достижения (окно 3 года)</h3>
          <ul className="ach-list">
            {p.achievements.map((a, i) => <li key={i}>{a.name} — {a.level}/{a.status} · <b>{a.score}</b> (блок {a.block}, {a.date})</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}


// Личное дело (контур Б): характеристика, благодарности, взыскания, участия в мероприятиях.
// Заполняет руководство факультета; в аккаунте обучающегося раздел не отображается.
const REC_KINDS = [
  ['characteristic', '📄 Характеристика'],
  ['gratitude', '🏅 Благодарности'],
  ['discipline', '⚠️ Взыскания'],
  ['event_participation', '🎖️ Участия в мероприятиях'],
];

function PersonalFile({ records, canEdit, userId, anon }) {
  const [form, setForm] = useState({ kind: 'characteristic', title: '', body: '', eventDate: new Date().toISOString().slice(0, 10) });
  const [msg, setMsg] = useState('');
  // reload только для редактирующего режима (в анонимном просмотре участника данные приходят из паспорта)
  const reload = () => userId != null ? api.get(`/api/mkr/records/${userId}`).then(setLocal) : Promise.resolve();
  const [local, setLocal] = useState(records);
  useEffect(() => { setLocal(records); }, [records]);

  const add = async () => {
    setMsg('');
    try {
      await api.post(`/api/mkr/records/${userId}`, form);
      setMsg('Запись добавлена'); setForm({ ...form, title: '', body: '' });
      await reload();
    } catch (e) { setMsg(e.message); }
  };
  const del = async (id) => {
    try { await api.del(`/api/mkr/records/${userId}/${id}`); await reload(); } catch (e) { setMsg(e.message); }
  };
  const saveEdit = async (rec) => {
    try { await api.put(`/api/mkr/records/${userId}/${rec.id}`, rec); await reload(); } catch (e) { setMsg(e.message); }
  };

  return (
    <div className="card wide" style={{ marginTop: 14 }} >
      <h3>Личное дело <small className="muted">· {anon ? 'разделы заполняет руководство факультета, записи видны без подписей' : 'заполняет руководство факультета'}</small></h3>
      {!canEdit && !local?.length && <p className="muted">Разделы личного дела пока не заполнены руководством факультета.</p>}
      {REC_KINDS.map(([kind, label]) => {
        const items = (local || []).filter(x => x.kind === kind);
        if (!items.length && !canEdit) return null;
        return (
          <div key={kind} className="rec-group">
            <h4>{label}{items.length ? ` (${items.length})` : ''}</h4>
            {items.map(rec => (
              <RecItem key={rec.id} rec={rec} canEdit={canEdit} anon={anon} onSave={saveEdit} onDel={() => del(rec.id)} />
            ))}
          </div>
        );
      })}
      {canEdit && (
        <div className="rec-form">
          <div className="row">
            <label>Раздел
              <select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
                {REC_KINDS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
            <label className="grow">Название<input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Напр.: Благодарность начальника факультета" /></label>
            <label>Дата<input type="date" value={form.eventDate} onChange={e => setForm({ ...form, eventDate: e.target.value })} /></label>
          </div>
          <label className="grow">Содержание<textarea rows="3" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></label>
          <div className="row"><button className="btn primary" disabled={!form.title.trim()} onClick={add}>Добавить запись</button>{msg && <span className="ok">{msg}</span>}</div>
        </div>
      )}
    </div>
  );
}

// Запись личного дела: просмотр + инлайн-редактирование (руководство факультета)
function RecItem({ rec, canEdit, anon, onSave, onDel }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState(rec);
  useEffect(() => { setF(rec); }, [rec]);
  if (!canEdit || !edit) {
    return (
      <div className="rec-item">
        <div><b>{rec.title}</b> <small className="muted">{rec.eventDate || ''}{!anon && rec.authorName ? ` · внес: ${rec.authorName}` : ''}</small></div>
        {rec.body && <p className="rec-body">{rec.body}</p>}
        {canEdit && (
          <span className="row" style={{ gap: 6 }}>
            <button className="btn small ghost" onClick={() => setEdit(true)}>Изменить</button>
            <button className="btn small ghost" onClick={onDel}>Удалить</button>
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="rec-item editing">
      <input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
      <input type="date" value={f.eventDate || ''} onChange={e => setF({ ...f, eventDate: e.target.value })} />
      <textarea rows="3" value={f.body || ''} onChange={e => setF({ ...f, body: e.target.value })} />
      <span className="row" style={{ gap: 6 }}>
        <button className="btn small primary" disabled={!f.title?.trim()} onClick={() => { onSave(f); setEdit(false); }}>Сохранить</button>
        <button className="btn small ghost" onClick={() => { setEdit(false); setF(rec); }}>Отмена</button>
      </span>
    </div>
  );
}
