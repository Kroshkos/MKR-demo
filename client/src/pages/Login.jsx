import { useState } from 'react';
import { useAuth } from '../auth.jsx';

const DEMO = [
  ['member1', 'Курсант (демо)'], ['verifier1', 'Верификатор науч. отдела'], ['verifier2', 'Верификатор спорт. отдела'],
  ['admin', 'Администратор МКР'], ['leadership', 'Руководство'], ['sysadmin', 'Системный администратор'], ['owner', 'Владелец'],
];

export default function Login() {
  const { login } = useAuth();
  const [loginName, setLogin] = useState('member1');
  const [password, setPassword] = useState('demo123');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await login(loginName, password); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <h1>МКР<span>.ВМедА</span></h1>
        <p className="muted">Молодёжный кадровый резерв · ГВМедА им. С.М. Кирова</p>
        <label>Логин
          <input value={loginName} onChange={e => setLogin(e.target.value)} autoFocus />
        </label>
        <label>Пароль
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        {err && <div className="error">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Вход…' : 'Войти'}</button>
        <div className="demo">
          <b className="muted">Демо-роли (пароль demo123):</b>
          {DEMO.map(([l, t]) => (
            <button type="button" key={l} className="chip" onClick={() => setLogin(l)}>{l} — {t}</button>
          ))}
        </div>
      </form>
    </div>
  );
}
