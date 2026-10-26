'use strict';
/* Автотесты ядра расчёта (ТЗ Приложение A) на изолированной БД в памяти. */
const assert = require('assert');
process.env.DB_PATH = ':memory:';
const { initDb } = require('../src/db/seed');
const { computeScore, loadCoefs, loadThresholds, ratedItems, buildPassport, stageFor } = require('../src/engine');

const db = initDb();
const C = loadCoefs(db), T = loadThresholds(db);

// 1. Формула: Балл = База × М × С × Кп × (команда ? 0.7 : 1)
assert.strictEqual(computeScore({ baseScore: 10, level: 'всеросс', status: 'победитель', kp: 1.5, isTeam: 0, blockCode: 2 }, C), 45);
assert.strictEqual(computeScore({ baseScore: 10, level: 'всеросс', status: 'победитель', kp: 1.5, isTeam: 1, blockCode: 2 }, C), 31.5);
// 2. Спорт — потолок 10 на позицию
assert.strictEqual(computeScore({ baseScore: 5, level: 'межд', status: 'победитель', kp: 0.8, isTeam: 0, blockCode: 7 }, C), 10); // 5*4*1*0.8=16 → 10
// 3. Этапы по порогам
assert.strictEqual(stageFor(250, T), 'Резидент');
assert.strictEqual(stageFor(150, T), 'Кандидат');
assert.strictEqual(stageFor(149.9, T), 'Участник');
// 4. Паспорт: ИУ/ИШ/Кг считаются по approved
const p = buildPassport(ratedItems(db, 1, C, T), C, T);
assert.ok(p.total > 0 && p.stage === 'Резидент', 'Иванов — Резидент');
assert.ok(p.iu + p.ish <= 100 && p.kg >= 0.8 && p.kg <= 1.5);
// 5. Анти-паттерн тезисов: сумма ≤ 5 за период
db.prepare("INSERT INTO catalog (blockCode,track,name,baseScore,defaultKp,defaultProfile,isThesis) VALUES (2,'Общий','Тезис X',100,1.5,'surg',1)").run();
db.prepare("INSERT INTO achievements (userId,catalogId,blockCode,level,status,profileMpmk,kp,isTeam,eventDate,verifyState,computedScore) VALUES (1,14,2,'вуз','победитель','surg',1.5,0,date('now'),'approved',150)").run();
const items = ratedItems(db, 1, C, T);
const thesisSum = items.filter(i => i.isThesis).reduce((a, b) => a + b.computedScore, 0);
assert.ok(thesisSum <= 5, 'тезисы не более 5 баллов');
// 6. Row-level: верификатор видит только свои блоки
const { verifierBlocks } = require('../src/middleware/auth');
assert.deepStrictEqual(verifierBlocks(db, 5), [1]);    // Учебный отдел — блок 1
assert.deepStrictEqual(verifierBlocks(db, 8), [4, 8]); // молодёжный отдел — блоки 4 и 8

console.log('OK: все 6 групп проверок пройдены.');
