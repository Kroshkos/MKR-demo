import { useEffect, useState } from 'react';
import { api } from '../api';

export default function AuditLog() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get('/api/admin/audit?limit=300').then(setRows); }, []);
  if (!rows) return <p className="muted">Загрузка…</p>;
  return (
    <section className="card wide">
      <h2>Журнал аудита ({rows.length})</h2>
      <table>
        <thead><tr><th>ID</th><th>Дата (UTC)</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Детали</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>{r.id}</td><td>{r.ts}</td><td>{r.actor}</td><td><code>{r.action}</code></td>
              <td>{r.entity}:{r.entityId ?? '—'}</td>
              <td><small className="muted">{r.payload || ''}</small></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
