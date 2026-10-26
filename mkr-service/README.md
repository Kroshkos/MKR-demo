# МКР.ВМедА — информационная система Молодёжного кадрового резерва ВМА им. С.М. Кирова

Полноценный веб-сервис по ТЗ: два контура (А «Рейтинг + верификация», Б закрытый «МКР»),
6 ролей RBAC, движок расчёта баллов `База × М × С × Кп × (команда?0.7:1)` с анти-паттернами,
паспорт резервиста (радар 9 блоков, вектор профилей МПМК, ИУ/ИШ/Кг), решения Совета, аудит.

**Стек:** Express 5 + better-sqlite3 + JWT (httpOnly-cookie) · React 18 + Vite (SPA) · Node 20.

## Локальный запуск
```bash
npm install          # postinstall: установка зависимостей client/ и сборка SPA
npm test             # автотесты ядра расчёта
npm run dev          # API :3001 + vite dev :5173 (или npm start — всё вместе на :3001)
```
Демо-входы (пароль `demo123`): member1…member4, verifier1…verifier4, admin, leadership, owner, sysadmin.

## Деплой на Amvera Cloud (https://docs.amvera.ru)

Проект настроен на деплои файлом **`amvera.yml`** (окружение `node`, toolchain `npm 20`).
Загружать на Amvera нужно содержимое папки `mkr-service/` — там лежит `amvera.yml`.

### Способ 1 — из git-репозитория (рекомендуется)
1. https://amvera.ru → «Создать приложение» → «Из git-репозитория» (GitHub/GitLab или Amvera как основной репозиторий).
2. Amvera сама прочитает `amvera.yml`: фаза сборки `npm install` + команды build (установка клиента, `vite build`), запуск `npm run start`, порт 3001, постоянное хранилище `/data`.
3. В панели: **Конфигурация → Переменные** задать хотя бы одну секрет-переменную:
   - `JWT_SECRET` — длинная случайная строка (обязательно в продуктиве; без неё сервер предупредит в логах);
   - `NODE_ENV=production` уже задан в `amvera.yml` (можно переопределить в панели);
   - `SEED_DEMO=false` — если нужен «чистый» запуск без демо-пользователей (справочники ТЗ загружаются всегда);
   - `PORT` задавать не нужно — Amvera передаёт его контейнеру сама.
4. Deploy/push → сборка и запуск автоматические; приложение доступно на домене `*.amvera.app` (HTTPS из коробки).

### Способ 2 — через Docker
В репозитории есть `Dockerfile` (node:20-slim + компиляция better-sqlite3 + сборка клиента)
и `.dockerignore`. В панели Amvera выберите окружение **Docker** вместо npm.

### Как устроено хранение данных (частая ошибка новичков Amvera)
Эфемерная файловая система контейнера очищается при перезапуске/пересборке, поэтому
при `NODE_ENV=production` база SQLite пишется в **постоянное хранилище `/data/mkr.db`**
(`run.persistenceMount: /data` в amvera.yml). Проверено локальной имитацией:
перезапуск процесса → данные сохраняются. Для более тяжёлых нагрузок можно перейти
на сервис PostgreSQL от Amvera (docs.amvera.ru/databases/postgreSQL) — слой БД изолирован в `server/src/db`.

### Безопасность под HTTPS-прокси Amvera
- Cookie JWT: `HttpOnly; SameSite=Lax; Secure` (Secure включается при `NODE_ENV=production` или заголовке `X-FORWARDED-PROTO: https`).
- Сервер слушает `process.env.PORT || 3001` и биндится на `0.0.0.0` (обязательно для контейнерных платформ).
- Секрет подписи токенов берётся только из переменной окружения `JWT_SECRET`.

## Структура
```
mkr-service/
├── amvera.yml  Dockerfile  .dockerignore      # деплой
├── server/src/{index.js, engine.js, db/{schema.sql,seed.js}, middleware/auth.js, routes/*}
├── server/test/engine.test.js                 # npm test
└── client/                                    # React+Vite SPA → dist отдаётся сервером
```
