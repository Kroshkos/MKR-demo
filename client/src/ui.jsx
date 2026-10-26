import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './auth.jsx';
import { useNotifications } from './notifications.jsx';

export const STAGE_COLOR = { Резидент: '#059669', Кандидат: '#b45309', Участник: '#64748b' };

/* ---------------- Тема (светлая/тёмная) ---------------- */
const ThemeCtx = createContext({ theme: 'light', toggle: () => {} });
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('mkr-theme')
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('mkr-theme', theme);
  }, [theme]);
  const toggle = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}
export const useTheme = () => useContext(ThemeCtx);

/* ---------------- Примитивы ---------------- */
export function Stage({ stage }) {
  return <span className="badge" style={{ background: STAGE_COLOR[stage] || '#64748b' }}>{stage}</span>;
}

export function Bar({ pct, color }) {
  return (
    <div className="bar"><div className="bar-fill" style={color ? { width: `${Math.min(pct, 100)}%`, background: color } : { width: `${Math.min(pct, 100)}%` }} /></div>
  );
}

// Кольцо прогресса до следующего этапа
export function Ring({ pct = 0, label, sub, size = 120, stroke = 10 }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#0b3fa8" /><stop offset="55%" stopColor="#4f46e5" /><stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <circle className="ring-bg" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle className="ring-fg" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
                strokeDasharray={c} strokeDashoffset={off} />
      </svg>
      <div className="ring-label"><b>{label}</b>{sub && <small>{sub}</small>}</div>
    </div>
  );
}

// Скелетон загрузки
export function Skeleton({ h = 18, w = '100%', r = 10, style }) {
  return <div className="skel" style={{ height: h, width: w, borderRadius: r, ...style }} />;
}

// Тост-уведомление (авто-скрытие)
export function Toast({ msg, kind = 'ok', onClose }) {
  useEffect(() => { if (!msg) return; const t = setTimeout(onClose, 3200); return () => clearTimeout(t); }, [msg]);
  if (!msg) return null;
  return <div className={`toast ${kind}`}>{kind === 'ok' ? '✓' : '!'}<span>{msg}</span></div>;
}

// Прогресс до следующего этапа резерва (пороги из настроек контура)
export function StageProgress({ total, stage, thresholds }) {
  if (!thresholds) return null;
  const next = stage === 'Участник' ? { name: 'Кандидат', need: thresholds.candidate }
    : stage === 'Кандидат' ? { name: 'Резидент', need: thresholds.resident } : null;
  const prev = stage === 'Кандидат' ? thresholds.candidate : stage === 'Резидент' ? thresholds.resident : 0;
  if (!next) return <p className="muted">Максимальный этап достигнут 🎉</p>;
  const span = Math.max(1, next.need - prev);
  const pct = Math.round(((total - prev) / span) * 100);
  return (
    <div className="progress-wrap">
      <div className="ring-wrap">
        <Ring pct={pct} label={`${pct}%`} sub="прогресс этапа" />
        <div>
          <div className="vec-row">
            <span className="vec-name">До «{next.name}»</span>
            <Bar pct={pct} />
            <span className="vec-pct">{Math.max(0, Math.round((next.need - total) * 10) / 10)} б.</span>
          </div>
          <p className="muted" style={{ margin: '2px 0 0' }}>Порог: {next.need} баллов · сейчас {total}</p>
        </div>
      </div>
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
      {rings.map((p, k) => <polygon key={k} points={p} fill="none" stroke="var(--line-strong)" strokeWidth="1" />)}
      {data.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" />; })}
      <polygon points={poly} fill="rgba(79,70,229,.22)" stroke="#4f46e5" strokeWidth="2" />
      {data.map((d, i) => {
        const [x, y] = pt(i, R + 20);
        return <text key={i} x={x} y={y} textAnchor="middle" fontSize="10" fill="currentColor">{d.block}·{d.points}</text>;
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
      <button className="icon-btn" onClick={() => setOpen(!open)} title="Уведомления">
        <span className={unread > 0 ? 'bell-ring' : ''}>🔔</span>
        {unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
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

function initials(name) {
  if (!name) return '?';
  const parts = name.split(/[\s.-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

export function Layout({ children }) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const ROLE_NAME = { member: 'Курсант', verifier: 'Верификатор отдела', mkr_admin: 'Администратор МКР', leadership: 'Руководство', owner: 'Владелец системы', sysadmin: 'Системный администратор' };
  const nav = [];
  if (user?.role === 'member') { nav.push(['/me', 'Мои достижения'], ['/me/passport', 'Мой паспорт']); }
  if (user?.role === 'verifier') { nav.push(['/verify', 'Очередь верификации']); }
  if (['mkr_admin', 'leadership', 'owner'].includes(user?.role)) { nav.push(['/mkr', 'Дашборд МКР'], ['/mkr/rating', 'Сводный рейтинг']); }
  if (['sysadmin', 'owner'].includes(user?.role)) { nav.push(['/admin', 'Настройки']); }
  if (['sysadmin', 'owner'].includes(user?.role)) { nav.push(['/admin/audit', 'Журнал аудита']); }
  const route = location.hash.slice(1) || '/';
  const displayName = user?.role === 'member' ? `Обучающийся · №${user?.id}` : user?.fullName;
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">МКР<span>.ВМедА</span></div>
        <nav>{nav.map(([to, t]) => <a key={to} href={`#${to}`} className={route === to ? 'active' : ''}>{t}</a>)}</nav>
        <button className="icon-btn" onClick={toggle} title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <Bell />
        <div className="who">
          <div className="avatar" title={displayName}>{initials(user?.role === 'member' ? String(user?.id) : user?.fullName)}</div>
          <div><b>{displayName}</b><br /><small>{ROLE_NAME[user?.role]}</small></div>
          <button className="btn ghost" onClick={logout}>Выйти</button>
        </div>
      </header>
      <main>{children}</main>
      <footer>ГВМедА им. С.М. Кирова · Молодёжный кадровый резерв · два контура · 152-ФЗ</footer>
    </div>
  );
}
