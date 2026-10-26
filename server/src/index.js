'use strict';
/** Точка входа сервера МКР.ВМедА (Express + SQLite). */
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { initDb } = require('./db/seed');

// Защита от падения при недоступности /data (например, локальный запуск с NODE_ENV=production)
let db;
try {
  db = initDb();
} catch (e) {
  console.warn('[server] не удалось открыть основную БД (' + e.message + '), откат на ./server/data/mkr.db');
  db = initDb(require('path').join(__dirname, '..', 'data', 'mkr.db'));
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
app.use(express.static(clientDist));
app.get('/{*splat}', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Обработчик ошибок
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 3001;
// bind на 0.0.0.0 обязательно для контейнерных платформ (Amvera): иначе порт недоступен извне
app.listen(PORT, '0.0.0.0', () => console.log(`[server] МКР.ВМедА запущен на порту ${PORT}`));
