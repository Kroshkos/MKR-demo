'use strict';
/**
 * Ядро расчёта баллов и индексов МКР.ВМедА
 * Балл = База × М(уровень) × С(статус) × Кп(профильность) × (команда ? 0.7 : 1)
 * Анти-паттерны: тезисы ≤ 5 баллов/семестр; одно мероприятие — один балл; спорт — потолок 10.
 */

const LEVELS = ['межд', 'всеросс', 'регион', 'вуз'];
const STATUSES = ['победитель', 'призёр', 'дипломант', 'участник'];

function loadCoefs(db) {
  const rows = db.prepare('SELECT kind, key, value FROM coefficients').all();
  const coefs = { M: {}, C: {}, Kp: {} };
  for (const r of rows) {
    if (coefs[r.kind]) coefs[r.kind][r.key] = Number(r.value);
  }
  return coefs;
}

function loadThresholds(db) {
  const rows = db.prepare("SELECT key, value FROM thresholds").all();
  const t = {};
  for (const r of rows) t[r.key] = Number(r.value);
  return t;
}

/** Расчёт балла одной позиции (по эталонному коду ТЗ, раздел 11, Приложение A). */
function computeScore(item, coefs) {
  const M = coefs.M[item.level] ?? 1;
  const C = coefs.C[item.status] ?? 0.25;
  const kp = Number(item.kp) || 1;
  let s = item.baseScore * M * C * kp * (item.isTeam ? 0.7 : 1);
  if (Number(item.blockCode) === 7) s = Math.min(s, 10); // спорт — потолок 10 баллов на позицию
  return Math.round(s * 10) / 10;
}

function stageFor(total, thresholds) {
  if (total >= (thresholds.resident ?? 250)) return 'Резидент';
  if (total >= (thresholds.candidate ?? 150)) return 'Кандидат';
  return 'Участник';
}

/**
 * Паспорт резервиста по approved-достижениям.
 * Возвращает: total, stage, profileVector, byBlock, ИУ, ИШ, Кг.
 */
function buildPassport(items, coefs, thresholds) {
  const total = items.reduce((a, b) => a + b.computedScore, 0);
  const byProfile = {}, byBlock = {};
  let uplift = 0, breadth = 0, weighted = 0;
  for (const it of items) {
    byProfile[it.profileMpmk] = (byProfile[it.profileMpmk] || 0) + it.computedScore;
    byBlock[it.blockCode] = (byBlock[it.blockCode] || 0) + it.computedScore;
    if (it.kp >= 1.2) uplift += it.computedScore;   // профильные
    if (it.kp <= 1.0) breadth += it.computedScore;  // общеактивностные
    weighted += it.computedScore * it.kp;
  }
  const pct = (v) => (total > 0 ? Math.round((v / total) * 100) : 0);
  return {
    total: Math.round(total * 10) / 10,
    stage: stageFor(total, thresholds),
    profileVector: Object.entries(byProfile).map(([k, v]) => ({ profile: k, points: Math.round(v * 10) / 10, pct: pct(v) }))
      .sort((a, b) => b.pct - a.pct),
    byBlock: Object.entries(byBlock).map(([k, v]) => ({ block: Number(k), points: Math.round(v * 10) / 10, pct: pct(v) })),
    iu: pct(uplift),   // индекс углублённости
    ish: pct(breadth),// индекс широты
    kg: total > 0 ? Math.round((weighted / total) * 100) / 100 : 0, // коэффициент глубины
  };
}

/**
 * Рейтинговый список с применением анти-паттернов:
 *  - сумма тезисов не более 5 баллов за семестр;
 *  - за одно мероприятие баллы начисляются один раз;
 *  - учитываются достижения за последние 3 года.
 */
function ratedItems(db, userId, coefs, thresholds, yearsWindow = 3) {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - yearsWindow);
  const rows = db.prepare(`
    SELECT a.*, c.name AS catalogName, c.baseScore, c.isThesis
    FROM achievements a JOIN catalog c ON c.id = a.catalogId
    WHERE a.userId = ? AND a.verifyState = 'approved' AND a.eventDate >= ?
    ORDER BY a.eventDate ASC`).all(userId, cutoff.toISOString().slice(0, 10));

  const seen = [];        // анти-паттерн «одно мероприятие — один балл»
  let thesisSum = 0;
  const out = [];
  for (const r of rows) {
    const score = computeScore({ ...r, baseScore: r.baseScore }, coefs);
    if (seen.some(s => s.eventDate === r.eventDate && s.catalogId === r.catalogId)) continue;
    if (r.isThesis) {
      const cap = thresholds.thesisSemesterCap ?? 5;
      const allowed = Math.max(0, cap - thesisSum);
      const use = Math.min(score, allowed);
      thesisSum += use;
      if (use <= 0) continue;
      out.push({ ...r, computedScore: Math.round(use * 10) / 10 });
      continue;
    }
    seen.push(r);
    out.push({ ...r, computedScore: score });
  }
  return out;
}

module.exports = { computeScore, stageFor, buildPassport, loadCoefs, loadThresholds, ratedItems, LEVELS, STATUSES };
