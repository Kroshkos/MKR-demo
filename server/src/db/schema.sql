-- Схема БД МКР.ВМедА (ТЗ раздел 10). Единая база, строгое разграничение прав на уровне приложения.

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  blockCodes TEXT NOT NULL DEFAULT '[]'   -- JSON: привязанные тематические блоки
);

CREATE TABLE IF NOT EXISTS blocks (
  code INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  ceiling REAL NOT NULL                   -- потолок блока
);

CREATE TABLE IF NOT EXISTS profiles_mpmk (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fullName TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('member','verifier','mkr_admin','leadership','owner','sysadmin')),
  departmentId INTEGER REFERENCES departments(id),
  track TEXT,                             -- специальность/направление обучающегося
  course INTEGER,
  profileMpmk TEXT REFERENCES profiles_mpmk(code),
  consentPd INTEGER NOT NULL DEFAULT 0    -- согласие на обработку ПДн (152-ФЗ)
);

CREATE TABLE IF NOT EXISTS catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  blockCode INTEGER NOT NULL REFERENCES blocks(code),
  track TEXT,
  name TEXT NOT NULL,
  baseScore REAL NOT NULL,
  defaultKp REAL NOT NULL DEFAULT 1.0,
  defaultProfile TEXT REFERENCES profiles_mpmk(code),
  isThesis INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId INTEGER NOT NULL REFERENCES users(id),
  catalogId INTEGER NOT NULL REFERENCES catalog(id),
  blockCode INTEGER NOT NULL REFERENCES blocks(code),
  level TEXT NOT NULL,                    -- межд | всеросс | регион | вуз
  status TEXT NOT NULL,                   -- победитель | призёр | дипломант | участник
  profileMpmk TEXT NOT NULL,
  kp REAL NOT NULL DEFAULT 1.0,
  isTeam INTEGER NOT NULL DEFAULT 0,
  eventDate TEXT NOT NULL,                -- ISO yyyy-mm-dd
  docUrl TEXT,                            -- ссылка в защищённом хранилище (не сам файл)
  computedScore REAL NOT NULL DEFAULT 0,
  verifyState TEXT NOT NULL DEFAULT 'draft'
    CHECK (verifyState IN ('draft','submitted','in_review','approved','rejected','revision')),
  verifierId INTEGER REFERENCES users(id),
  verifierComment TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reserve (
  userId INTEGER PRIMARY KEY REFERENCES users(id),
  stage TEXT NOT NULL,
  councilNote TEXT,
  decidedBy INTEGER REFERENCES users(id),
  decidedAt TEXT
);

CREATE TABLE IF NOT EXISTS coefficients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('M','C','Kp')),
  key TEXT NOT NULL,
  value REAL NOT NULL,
  UNIQUE (kind, key)
);

CREATE TABLE IF NOT EXISTS thresholds (
  key TEXT PRIMARY KEY,
  value REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entityId TEXT,
  payload TEXT,
  ts TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ach_user ON achievements(userId);
CREATE INDEX IF NOT EXISTS idx_ach_state ON achievements(verifyState);
CREATE INDEX IF NOT EXISTS idx_ach_block ON achievements(blockCode, verifyState);
