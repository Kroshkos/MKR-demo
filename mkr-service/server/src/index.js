'use strict';
/** Точка входа сервера МКР.ВМедА (Express + SQLite). */
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { initDb } = require('./db/seed');

const db = initDb();
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
app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));

// Обработчик ошибок
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`[server] МКР.ВМедА запущен: http://localhost:${PORT}`));
