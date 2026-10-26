import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './auth.jsx';
import { NotificationsProvider } from './notifications.jsx';
import { Layout, ThemeProvider } from './ui.jsx';
import Login from './pages/Login.jsx';
import MyAchievements from './pages/MyAchievements.jsx';
import MyPassport from './pages/MyPassport.jsx';
import VerifyQueue from './pages/VerifyQueue.jsx';
import MkrDashboard from './pages/MkrDashboard.jsx';
import MkrRating from './pages/MkrRating.jsx';
import Admin from './pages/Admin.jsx';
import AuditLog from './pages/AuditLog.jsx';
import './styles.css';
import './theme.css';

// Мини-роутер на hash — без внешних зависимостей
function useHashRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || '/');
  useEffect(() => {
    const onHash = () => setRoute(location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

const HOME = { member: '/me', verifier: '/verify', mkr_admin: '/mkr', leadership: '/mkr', owner: '/mkr', sysadmin: '/admin' };
const ALLOWED = {
  member: ['/me', '/me/passport'],
  verifier: ['/verify'],
  mkr_admin: ['/mkr', '/mkr/rating'],
  leadership: ['/mkr', '/mkr/rating'],
  sysadmin: ['/admin', '/admin/audit'],
  owner: ['/mkr', '/mkr/rating', '/admin', '/admin/audit'],
};

function Shell() {
  const { user } = useAuth();
  const route = useHashRoute();

  useEffect(() => {
    if (!user) return;
    const home = HOME[user.role] || '/';
    if (route === '/' || !(ALLOWED[user.role] || []).includes(route)) location.hash = home;
  }, [user, route]);

  if (user === undefined) return <p className="muted center">Загрузка…</p>;
  if (user === null) return <Login />;

  const pages = {
    '/me': <MyAchievements />,
    '/me/passport': <MyPassport />,
    '/verify': <VerifyQueue />,
    '/mkr': <MkrDashboard />,
    '/mkr/rating': <MkrRating role={user.role} />,
    '/admin': <Admin />,
    '/admin/audit': <AuditLog />,
  };
  const page = pages[route] || (HOME[user.role] === '/me' ? <MyAchievements /> : null);
  if (!page) return null;
  return <Layout>{page}</Layout>;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationsProvider>
          <Shell />
        </NotificationsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
