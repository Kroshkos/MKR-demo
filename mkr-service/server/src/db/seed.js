'use strict';
/** Инициализация БД и сидирование справочников/демо-данных по ТЗ МКР.ВМедА. */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const { computeScore, loadCoefs, loadThresholds } = require('../engine');

// Локально — ./server/data; на Amvera — постоянное хранилище /data (run.persistenceMount),
// чтобы база не терялась при перезапуске/пересборке (см. docs.amvera.ru/applications/storage.html).
const DEFAULT_DB_PATH = process.env.NODE_ENV === 'production'
  ? path.join('/data', 'mkr.db')
  : path.join(__dirname, '..', '..', 'data', 'mkr.db');
const DB_PATH = process.env.DB_PATH || DEFAULT_DB_PATH;

function hash(pw) { return crypto.scryptSync(pw, 'mkr-salt', 32).toString('hex'); }

function initDb(dbPath = DB_PATH) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8'));

  const count = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  if (count === 0) seed(db, { demo: process.env.SEED_DEMO !== 'false' });
  return db;
}

/**
 * Сидирование. Справочники (блоки, профили, отделы, коэффициенты, пороги, каталог)
 * загружаются всегда — без них система не работает.
 * Демо-данные (пользователи, достижения, резерв) — только при SEED_DEMO != 'false'.
 * Для «чистого» продакшена на Amvera задайте переменную окружения SEED_DEMO=false
 * и создайте пользователей через раздел Настройки → Пользователи.
 */
function seed(db, opts = {}) {
  const demo = opts.demo !== false;
  // --- Справочники -----------------------------------------------------------
  const blocks = [
    [1, 'Учебная/Клиническая', 40], [2, 'Научная', 30], [3, 'Методическая', 18],
    [4, 'Общественная', 15], [5, 'Военно-политическая', 20], [6, 'Командно-административная', 18],
    [7, 'Спортивная', 10], [8, 'Прочие', 20], [9, 'Проектная', 25],
  ];
  const insBlock = db.prepare('INSERT INTO blocks (code,name,ceiling) VALUES (?,?,?)');
  blocks.forEach(b => insBlock.run(...b));

  const profiles = [
    ['ther', 'Терапевтический'], ['surg', 'Хирургический'], ['prev', 'Медико-профилактический'],
    ['biol', 'Медико-биологический'], ['hum', 'Гуманитарный'], ['mil', 'Военно-специальный'],
  ];
  const insProf = db.prepare('INSERT INTO profiles_mpmk (code,name) VALUES (?,?)');
  profiles.forEach(p => insProf.run(...p));

  const departments = [
    ['Учебный отдел', [1]], ['НИО', [2]], ['Методический отдел / УМО', [3]],
    ['Отдел по работе с молодёью', [4, 8]], ['Военно-политический отдел', [5]],
    ['Командование подразделений', [6]], ['Кафедра физической подготовки', [7]],
    ['Проектный офис МКР', [9]], ['Секретариат МКР', []],
  ];
  const insDep = db.prepare('INSERT INTO departments (name, blockCodes) VALUES (?,?)');
  for (const d of departments) insDep.run(d[0], JSON.stringify(d[1]));

  // Коэффициенты формулы
  const coefs = [
    ['M', 'межд', 4], ['M', 'всеросс', 3], ['M', 'регион', 2], ['M', 'вуз', 1],
    ['C', 'победитель', 1.0], ['C', 'призёр', 0.75], ['C', 'дипломант', 0.5], ['C', 'участник', 0.25],
    ['Kp', 'Профильные мед. дисциплины', 1.5], ['Kp', 'Военно-профессиональная', 1.3],
    ['Kp', 'Смежные (биомед/фарма)', 1.2], ['Kp', 'Общенаучные', 1.0],
    ['Kp', 'Спорт/творчество/гуманитарное', 0.8],
  ];
  const insCoef = db.prepare('INSERT INTO coefficients (kind,key,value) VALUES (?,?,?)');
  coefs.forEach(c => insCoef.run(...c));

  const thresholds = [['resident', 250], ['candidate', 150], ['thesisSemesterCap', 5]];
  const insThr = db.prepare('INSERT INTO thresholds (key,value) VALUES (?,?)');
  thresholds.forEach(t => insThr.run(...t));

  // Каталог позиций достижений
  const catalog = [
    [1, 'Лечебное дело', 'Олимпиада «Я — профессионал» (медицина)', 10, 1.5, 'ther', 0],
    [1, 'Лечебное дело', 'Публикация тезисов клинической конференции', 2, 1.5, 'ther', 1],
    [2, 'Общий', 'Публикация в журнале ВАК/Scopus', 8, 1.5, 'surg', 0],
    [2, 'Общий', 'Патент на изобретение / РУ', 12, 1.5, 'biol', 0],
    [2, 'Фармация', 'Конкурс УМНИК (грант)', 15, 1.2, 'biol', 0],
    [3, 'Общий', 'Методическая разработка, утверждённая УМО', 6, 1.3, 'prev', 0],
    [4, 'Общий', 'Волонтёрская миссия / общественный проект', 4, 1.0, 'hum', 0],
    [5, 'Общий', 'Конкурс военно-профессионального мастерства', 8, 1.3, 'mil', 0],
    [6, 'Общий', 'Командирские duties (роты/взвода) — результат', 6, 1.3, 'mil', 0],
    [7, 'Общий', 'Соревнования по физподготовке (норматив ГТО/звание)', 5, 0.8, 'hum', 0],
    [8, 'Общий', 'Студенческий стартап (конкурс)', 10, 1.2, 'biol', 0],
    [9, 'Общий', 'Реализованный проект в проектном офисе МКР', 12, 1.3, 'ther', 0],
    [2, 'Общий', 'Доклад на конференции (тезисы)', 2, 1.5, 'surg', 1],
  ];
  const insCat = db.prepare('INSERT INTO catalog (blockCode,track,name,baseScore,defaultKp,defaultProfile,isThesis) VALUES (?,?,?,?,?,?,?)');
  catalog.forEach(c => insCat.run(...c));

  if (!demo) {
    console.log('[seed] Справочники загружены. Демо-данные пропущены (SEED_DEMO=false).');
    return;
  }

  // Пользователи: по одной учётной записи на роль + несколько курсантов
  const users = [
    ['Иванов Иван Иванович', 'member1', 'member', null, 'Лечебное дело', 4, 'surg'],
    ['Петров Пётр Петрович', 'member2', 'member', null, 'Фармация', 3, 'biol'],
    ['Сидоров Сидор Сидорович', 'member3', 'member', null, 'Медико-профилактическое дело', 5, 'prev'],
    ['Курсант А. А.', 'member4', 'member', null, 'Лечебное дело', 2, 'ther'],
    ['Верификатор Учебного отдела', 'verifier1', 'verifier', 1],
    ['Верификатор НИО', 'verifier2', 'verifier', 2],
    ['Верификатор кафедры ФП', 'verifier3', 'verifier', 7],
    ['Верификатор отдела по работе с молодёью', 'verifier4', 'verifier', 4],
    ['Администратор МКР', 'admin', 'mkr_admin', 9],
    ['Начальник академии (руководство)', 'leadership', 'leadership', null],
    ['Владелец системы', 'owner', 'owner', null],
    ['Системный администратор ИТ', 'sysadmin', 'sysadmin', null],
  ];
  const insUser = db.prepare(`INSERT INTO users (fullName,login,passwordHash,role,departmentId,track,course,profileMpmk,consentPd)
                              VALUES (?,?,?,?,?,?,?,?,1)`);
  for (const u of users) insUser.run(u[0], u[1], hash('demo123'), u[2], u[3] ?? null, u[4] ?? null, u[5] ?? null, u[6] ?? null);

  // Демо-достижения (approved) для наглядного рейтинга
  const C = loadCoefs(db), T = loadThresholds(db);
  const today = new Date();
  const dstr = (y, m, dd) => `${today.getFullYear() - y}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const ach = [
    // user 1 (Иванов): Резидент (~268 баллов)
    [1, 3, 2, 'всеросс', 'победитель', 'surg', 1.5, 0, dstr(0, 4, 12)],
    [1, 1, 1, 'всеросс', 'призёр', 'surg', 1.5, 0, dstr(1, 3, 20)],
    [1, 12, 2, 'всеросс', 'победитель', 'surg', 1.5, 0, dstr(0, 10, 5)],
    [1, 10, 7, 'регион', 'победитель', 'hum', 0.8, 0, dstr(0, 5, 1)],
    [1, 8, 5, 'всеросс', 'призёр', 'mil', 1.3, 1, dstr(0, 6, 15)],
    [1, 5, 2, 'межд', 'дипломант', 'biol', 1.2, 0, dstr(1, 11, 8)],
    [1, 9, 6, 'регион', 'победитель', 'mil', 1.3, 1, dstr(0, 2, 2)],
    [1, 11, 9, 'всеросс', 'победитель', 'biol', 1.2, 1, dstr(0, 9, 9)],
    [1, 4, 2, 'регион', 'победитель', 'biol', 1.5, 0, dstr(0, 7, 7)],
    [1, 6, 3, 'регион', 'победитель', 'prev', 1.3, 0, dstr(0, 8, 8)],
    // user 2 (Петров): Кандидат (~175 баллов)
    [2, 4, 2, 'межд', 'призёр', 'biol', 1.2, 0, dstr(0, 3, 3)],
    [2, 10, 7, 'вуз', 'победитель', 'hum', 0.8, 0, dstr(0, 4, 4)],
    [2, 1, 1, 'всеросс', 'дипломант', 'ther', 1.5, 0, dstr(0, 5, 5)],
    [2, 5, 2, 'регион', 'победитель', 'biol', 1.2, 0, dstr(0, 6, 6)],
    [2, 3, 2, 'вуз', 'победитель', 'biol', 1.5, 0, dstr(0, 7, 1)],
    [2, 8, 5, 'регион', 'призёр', 'mil', 1.3, 0, dstr(0, 8, 2)],
    // user 3 (Сидоров): участник
    [3, 6, 3, 'вуз', 'участник', 'prev', 1.3, 0, dstr(0, 2, 2)],
    [3, 6, 3, 'регион', 'участник', 'prev', 1.3, 0, dstr(0, 9, 1)],
  ];
  const insAch = db.prepare(`INSERT INTO achievements
    (userId, catalogId, blockCode, level, status, profileMpmk, kp, isTeam, eventDate, verifyState, computedScore, verifierId, docUrl)
    VALUES (?,?,?,?,?,?,?,?,?,'approved',?,?, '/vault/demo')`);
  for (const a of ach) {
    const score = computeScore({ baseScore: catalog[a[1] - 1][3], level: a[3], status: a[4], kp: a[5], isTeam: a[6], blockCode: a[2] }, C);
    insAch.run(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7] ? 1 : 0, a[8], score, 5);
  }

  // Заявки в очереди верификации (контур А)
  const pending = [
    [1, 2, 1, 'регион', 'участник', 'surg', 1.5, 0, dstr(0, 9, 15), 'submitted'],
    [2, 12, 2, 'вуз', 'призёр', 'biol', 1.2, 0, dstr(0, 10, 20), 'submitted'],
    [4, 10, 7, 'вуз', 'победитель', 'hum', 0.8, 0, dstr(0, 10, 25), 'submitted'],
    [4, 7, 4, 'регион', 'участник', 'hum', 1.0, 1, dstr(0, 11, 1), 'in_review'],
  ];
  const insPend = db.prepare(`INSERT INTO achievements
    (userId, catalogId, blockCode, level, status, profileMpmk, kp, isTeam, eventDate, verifyState)
    VALUES (?,?,?,?,?,?,?,?,?,?)`);
  for (const p of pending) insPend.run(...p);

  // Состав резерва (контур Б)
  db.prepare('INSERT INTO reserve (userId, stage, councilNote, decidedBy, decidedAt) VALUES (?,?,?,?,datetime(\'now\'))')
    .run(1, 'Резидент', 'Решение Совета №14 от 15.09: включить в основной состав МКР', 9);
  db.prepare('INSERT INTO reserve (userId, stage, councilNote, decidedBy, decidedAt) VALUES (?,?,?,?,datetime(\'now\'))')
    .run(2, 'Кандидат', 'Решение Совета №15: испытательный период до конца семестра', 9);

  console.log('[seed] База данных заполнена справочниками и демо-данными.');
}

module.exports = { initDb };
