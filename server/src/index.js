'use strict';
/** Точка входа сервера МКР.ВМедА (Express + SQLite). */
const fs = require('fs');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { initDb } = require('./db/seed');

// Защита от недоступности постоянного хранилища: пробуем основную БД, затем ./server/data
let db;
try {
  db = initDb();
} catch (e) {
  console.warn('[server] не удалось открыть основную БД (' + e.message + '), откат на ./server/data/mkr.db');
  db = initDb(path.join(__dirname, '..', 'data', 'mkr.db'));
}
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// API
app.use('/api/auth', require('./routes/auth')(db));
app.use('/api', require('./routes/circuitA')(db));       // контур А
app.use('/api/mkr', require('./routes/circuitB')(db));   // контур Б (закрытый)
app.use('/api/admin', require('./routes/admin')(db));    // настройки

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'МКР.ВМедА', version: '1.0.0' }));

// Статика собранного клиента (SPA)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (!fs.existsSync(path.join(clientDist, 'index.html'))) {
  console.error(`[server] ВНИМАНИЕ: клиент не собран — ${clientDist}/index.html отсутствует.`);
  console.error('[server] Выполните сборку фронтенда перед запуском: npm run build');
} else {
  console.log('[server] SPA найден: ' + clientDist);
}
app.use(express.static(clientDist));
app.get('/{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err && !res.headersSent) res.status(503).type('text/plain').send('Клиент не собран. Выполните npm run build.');
  });
});

// Обработчик ошибок
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 3001;
// bind на 0.0.0.0 обязателен для контейнерных платформ (Amvera): иначе порт недоступен извне
const httpServer = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] МКР.ВМедА запущен на порту ${PORT}`);
  // Amvera может передавать собственный наружный порт в AMVERA_EXTERNAL_PORT:
  // дополнительно слушаем его, чтобы балансировщик попадал в приложение независимо от настроек.
  const extra = parseInt(process.env.AMVERA_EXTERNAL_PORT, 10);
  if (extra && String(extra) !== String(PORT)) {
    app.listen(extra, '0.0.0.0', () => console.log(`[server] дополнительно слушаю AMVERA_EXTERNAL_PORT=${extra}`));
  }
});
httpServer.on('error', (e) => { console.error('[server] ошибка listen:', e.message); process.exit(1); });
process.on('uncaughtException', (e) => { console.error('[server] uncaughtException:', e); });
