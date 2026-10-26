# МКР.ВМедА — информационная система Молодёжного кадрового резерва ВМА

Express + SQLite (better-sqlite3) + React/Vite SPA. Два контура ТЗ: А «Рейтинг+верификация», Б закрытый «МКР».

## Деплой на Amvera Cloud
Конфигурация **`amvera.yml` лежит в корне репозитория** (требование Amvera) — проект импортируется как есть, без подпапок.
Полная инструкция и особенности (хранение БД в `/data`, переменные, безопасность): **[README.amvera.md](README.amvera.md)**.

Кратко:
1. amvera.ru → Создать приложение → из git-репозитория `Kroshkos/MKR-demo` (ветка `main`).
2. Переменные окружения: секрет `JWT_SECRET` (остальное — в `amvera.yml`).
3. Deploy → приложение на `*.amvera.app`.

## Локальный запуск
```bash
npm install          # + postinstall соберёт клиент
npm test             # автотесты ядра расчёта
npm start            # http://localhost:3001
# демо-входы: member1 / verifier1 / admin / leadership / owner / sysadmin — пароль demo123
```

## Структура (корень = npm-проект сервиса)
```
├── amvera.yml  Dockerfile  .dockerignore      # деплой (корень!)
├── package.json                               # скрипты start/build/test/postinstall
├── server/src/{index.js, engine.js, db/{schema.sql,seed.js}, middleware/auth.js, routes/*}
├── server/test/engine.test.js
├── client/                                    # React+Vite SPA → dist отдаётся сервером
└── ТЗ_ПО_МКР_ВМедА.pdf, MKR_system_project.docx, …   # исходная документация
```
