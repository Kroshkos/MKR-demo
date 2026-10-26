import { useAuth } from './auth.jsx';

export const STAGE_COLOR = { Резидент: '#0d7a3f', Кандидат: '#b58900', Участник: '#6b7280' };

export function Stage({ stage }) {
  return <span className="badge" style={{ background: STAGE_COLOR[stage] || '#6b7280' }}>{stage}</span>;
}

export function Bar({ pct, color = '#1d4ed8' }) {
  return (
    <div className="bar"><div className="bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: color }} /></div>
  );
}

// Радар по 9 блокам — SVG без внешних библиотек
export function Radar({ data, size = 320 }) {
  const cx = size / 2, cy = size / 2, R = size / 2 - 46;
  const n = data.length || 1;
  const pt = (i, r) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const poly = data.map((d, i) => pt(i, R * (d.pct / 100)).join(',')).join(' ');
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
