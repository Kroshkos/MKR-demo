import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = загружается, null = не вошёл

  useEffect(() => {
    api.get('/api/auth/me').then(setUser).catch(() => setUser(null));
  }, []);

  const login = async (loginName, password) => {
    const u = await api.post('/api/auth/login', { login: loginName, password });
    setUser(u);
    return u;
  };
  const logout = async () => {
    await api.post('/api/auth/logout');
    setUser(null);
  };

  return <AuthCtx.Provider value={{ user, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
