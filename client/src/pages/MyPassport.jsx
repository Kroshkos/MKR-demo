import { useEffect, useState } from 'react';
import { api } from '../api';
import { Stage, Radar, Bar, StageProgress } from '../ui.jsx';

// Универсальный компонент паспорта: «мой паспорт» (member) и паспорт резервиста (контур Б).
export function PassportView({ p, canEditPlan, userId }) {
  if (!p) return <p className="muted">Загрузка…</p>;
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
  if (!p) return <p className="muted">Загрузка…</p>;
  return (
    <div>
      <h2>Мой паспорт резервиста{p.user ? <> · {p.user.fullName}</> : null}</h2>
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
