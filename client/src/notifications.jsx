import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';

const NotifCtx = createContext(null);

export function NotificationsProvider({ children }) {
  const [state, setState] = useState({ items: [], unread: 0 });

  const refresh = useCallback(() => {
    api.get('/api/notifications').then(setState).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000); // поллинг раз в 30 с
    return () => clearInterval(t);
  }, [refresh]);

  const markRead = useCallback(async (ids) => {
    await api.post('/api/notifications/read', ids ? { ids } : {}).catch(() => {});
    refresh();
  }, [refresh]);

  return <NotifCtx.Provider value={{ ...state, refresh, markRead }}>{children}</NotifCtx.Provider>;
}

export const useNotifications = () => useContext(NotifCtx);
