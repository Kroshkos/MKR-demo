import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Admin() {
  const [coefs, setCoefs] = useState(null);
  const [thr, setThr] = useState(null);
  const [deps, setDeps] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get('/api/admin/coefficients').then(setCoefs);
    api.get('/api/admin/thresholds').then(setThr);
    api.get('/api/admin/departments').then(setDeps);
    api.get('/api/admin/blocks').then(setBlocks);
  }, []);

  if (!coefs || !thr || !deps) return <p className="muted">Загрузка…</p>;

  const setVal = (kind, key, v) =>
    setCoefs(coefs.map(c => (c.kind === kind && c.key === key ? { ...c, value: Number(v) } : c)));

  const saveCoefs = async () => {
    await api.put('/api/admin/coefficients', { items: coefs.map(c => ({ kind: c.kind, key: c.key, value: c.value })) });
    setMsg('Коэффициенты сохранены'); setTimeout(() => setMsg(''), 2500);
  };
  const saveThr = async () => {
    await api.put('/api/admin/thresholds', { items: thr.map(t => ({ key: t.key, value: Number(t.value) })) });
    setMsg('Пороги сохранены'); setTimeout(() => setMsg(''), 2500);
  };
  const bindBlocks = async (d) => {
    await api.put(`/api/admin/departments/${d.id}`, { blockCodes: d.blockCodes });
    setMsg(`Отдел «${d.name}»: блоки сохранены`); setTimeout(() => setMsg(''), 2500);
  };
  const toggleBlock = (depId, code) =>
    setDeps(deps.map(d => d.id !== depId ? d : {
      ...d,
      blockCodes: d.blockCodes.includes(code) ? d.blockCodes.filter(x => x !== code) : [...d.blockCodes, code],
    }));

  const group = (kind) => coefs.filter(c => c.kind === kind);

  return (
    <div className="cols">
      {msg && <div className="ok fixed">{msg}</div>}
      <section className="card">
        <h2>Множители уровня М</h2>
        {group('M').map(c => (
          <label key={c.key} className="coef">{c.key}
            <input type="number" step="0.1" value={c.value} onChange={e => setVal('M', c.key, e.target.value)} /></label>
        ))}
        <h2>Множители статуса С</h2>
        {group('C').map(c => (
          <label key={c.key} className="coef">{c.key}
            <input type="number" step="0.05" value={c.value} onChange={e => setVal('C', c.key, e.target.value)} /></label>
        ))}
        <h2>Кп по умолчанию</h2>
        {group('Kp').map(c => (
          <label key={c.key} className="coef">{c.key}
            <input type="number" step="0.1" value={c.value} onChange={e => setVal('Kp', c.key, e.target.value)} /></label>
        ))}
        <button className="btn primary" onClick={saveCoefs}>Сохранить коэффициенты</button>
      </section>

      <section className="card">
        <h2>Пороги этапов</h2>
        {thr.map(t => (
          <label key={t.key} className="coef">{t.key}
            <input type="number" value={t.value} onChange={e => setThr(thr.map(x => x.key === t.key ? { ...x, value: e.target.value } : x))} /></label>
        ))}
        <button className="btn primary" onClick={saveThr}>Сохранить пороги</button>

        <h2>Привязка блоков к отделам-верификаторам</h2>
        {deps.map(d => (
          <div key={d.id} className="dep">
            <b>{d.name}</b>
            <div className="chips">
              {blocks.map(b => (
                <button key={b.code} type="button"
                  className={`chip ${d.blockCodes.includes(b.code) ? 'on' : ''}`}
                  onClick={() => toggleBlock(d.id, b.code)}>{b.code}·{b.name}</button>
              ))}
            </div>
            <button className="btn small" onClick={() => bindBlocks(d)}>Сохранить</button>
          </div>
        ))}
      </section>
    </div>
  );
}
