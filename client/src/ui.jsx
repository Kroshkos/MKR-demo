import { useState } from 'react';
import { useAuth } from './auth.jsx';
import { useNotifications } from './notifications.jsx';

export const STAGE_COLOR = { Резидент: '#0d7a3f', Кандидат: '#b58900', Участник: '#6b7280' };

export function Stage({ stage }) {
  return <span className="badge" style={{ background: STAGE_COLOR[stage] || '#6b7280' }}>{stage}</span>;
}

export function Bar({ pct, color = '#1d4ed8' }) {
  return (
    <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: color }} /></div>
  );
}

// Прогресс до следующего этапа резерва (пороги из настроек контура)
export function StageProgress({ total, stage, thresholds }) {
  if (!thresholds) return null;
  const next = stage === 'Участник' ? { name: 'Кандидат', need: thresholds.candidate }
    : stage === 'Кандидат' ? { name: 'Резидент', need: thresholds.resident } : null;
  const prev = stage === 'Кандидат' ? thresholds.candidate : stage === 'Резидент' ? thresholds.resident : 0;
  if (!next) {
    return <p className="muted">Максимальный этап достиген 🎉</p>;
  }
  const span = Math.max(1, next.need - prev);
  const pct = Math.round(((total - prev) / span) * 100);
  return (
    <div className="progress-wrap">
      <div className="vec-row">
        <span className="vec-name">До «{next.name}»</span>
        <Bar pct={pct} color="#7c3aed" />
        <span className="vec-pct">{Math.max(0, Math.round((next.need - total) * 10) / 10)} б.</span>
      </div>
      <p className="muted" style={{ margin: '2px 0 0' }}>Порог: {next.need} баллов · сейчас {total}</p>
    </div>
  );
}

// Радар по блокам активности — SVG без внешних библиотек
export function Radar({ data, size = 320 }) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 46;
  const n = data.length || 1;
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = data.map((d, i) => pt(i, R * Math.min(d.pct, 100) / 100).join(',')).join(' ');
  const rings = [0.25, 0.5, 0.75, 1].map(f => data.map((_, i) => pt(i, R * f).join(',')).join(' '));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="radar">
      {rings.map((p, k) => <polygon key={k} points={p} fill="none" stroke="#d1d5db" strokeWidth="1" />)}
      {data.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e7eb" />; })}
      <polygon points={poly} fill="rgba(29,78,216,.25)" stroke="#1d4ed8" strokeWidth="2" />
      {data.map((d, i) => {
        const [x, y] = pt(i, R + 20);
        return <text key={i} x={x} y={y} textAnchor="middle" fontSize="10" fill="#374151">{d.block}·{d.points}</text>;
      })}
    </svg>
  );
}

function Bell() {
  const { items, unread, markRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const TYPE_ICON = { 'verify.new': '📥', 'verify.decision': '✅', 'stage.up': '🚀', 'stage.change': '🔁', 'council.decision': '🏛️', 'plan.update': '🎯', digest: '📊' };
  return (
    <div className="bell-wrap">
      <button className="bell" onClick={() => setOpen(!open)} title="Уведомления">
        🔔{unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="dropdown">
          <div className="dd-head">
            <b>Уведомления</b>
            {unread > 0 && <button className="btn small ghost" onClick={() => markRead()}>Прочитать все</button>}
          </div>
          {!items.length && <p className="muted dd-empty">Пока пусто</p>}
          {items.slice(0, 12).map(n => (
            <a key={n.id} className={`dd-item ${n.readAt ? '' : 'unread'}`} href={n.link || '#'}
               onClick={() => { if (!n.readAt) markRead([n.id]); setOpen(false); }}>
              <span>{TYPE_ICON[n.type] || '•'}</span>
              <div><b>{n.title}</b>{n.body && <small>{n.body}</small>}<em>{n.createdAt} UTC</em></div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function Layout({ children }) {
  const { user, logout } = useAuth();
  const ROLE_NAME = { member: 'Курсант', verifier: 'Верификатор отдела', mkr_admin: 'Администратор МКР', leadership: 'Руководство', owner: 'Владелец системы', sysadmin: 'Системный администратор' };
  const nav = [];
  if (user?.role === 'member') { nav.push(['/me', 'Мои достижения'], ['/me/passport', 'Мой паспорт']); }
  if (user?.role === 'verifier') { nav.push(['/verify', 'Очередь верификации']); }
  if (['mkr_admin', 'leadership', 'owner'].includes(user?.role)) { nav.push(['/mkr', 'Дашборд МКР'], ['/mkr/rating', 'Сводный рейтинг']); }
  if (['sysadmin', 'owner'].includes(user?.role)) { nav.push(['/admin', 'Настройки']); }
  if (['sysadmin', 'owner'].includes(user?.role)) { nav.push(['/admin/audit', 'Журнал аудита']); }
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">МКР<span>.ВМедА</span></div>
        <nav>{nav.map(([to, t]) => <a key={to} href={`#${to}`}>{t}</a>)}</nav>
        <Bell />
        <div className="who">
          <div><b>{user?.fullName}</b><br /><small>{ROLE_NAME[user?.role]}</small></div>
          <button className="btn ghost" onClick={logout}>Выйти</button>
        </div>
      </header>
      <main>{children}</main>
      <footer>ГВМедА им. С.М. Кирова · Молодёжный кадровый резерв · два контура · 152-ФЗ</footer>
    </div>
  );
}
