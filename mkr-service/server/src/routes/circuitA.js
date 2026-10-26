'use strict';
/** Контур А — достижения курсантов и распределённая верификация профильными отделами. */
const express = require('express');
const { auth, requireRole, verifierBlocks, audit } = require('../middleware/auth');
const { computeScore, loadCoefs, loadThresholds, ratedItems, buildPassport, LEVELS, STATUSES } = require('../engine');

module.exports = function (db) {
  const r = express.Router();

  // Справочник позиций каталога (автоподстановка база/Кп/профиль)
  r.get('/catalog', auth, (req, res) => {
    const track = req.query.track;
    const rows = track
      ? db.prepare('SELECT * FROM catalog WHERE track=? OR track=\'Общий\'').all(track)
      : db.prepare('SELECT * FROM catalog').all();
    res.json(rows);
  });

  r.get('/levels', auth, (req, res) => res.json({ levels: LEVELS, statuses: STATUSES }));

  // Мои достижения (member — только свои, row-level)
  r.get('/me/achievements', auth, requireRole('member'), (req, res) => {
    const C = loadCoefs(db), T = loadThresholds(db);
    const rows = db.prepare(`
      SELECT a.*, c.name AS catalogName, c.baseScore, c.isThesis, b.name AS blockName
      FROM achievements a JOIN catalog c ON c.id=a.catalogId JOIN blocks b ON b.code=a.blockCode
      WHERE a.userId=? ORDER BY a.createdAt DESC`).all(req.user.id);
    const items = ratedItems(db, req.user.id, C, T);
    const passport = buildPassport(items, C, T);
    res.json({ achievements: rows, myTotal: passport.total, myStage: passport.stage });
  });

  // Мой упрощённый паспорт (member видит только свой)
  r.get('/me/passport', auth, requireRole('member'), (req, res) => {
    const C = loadCoefs(db), T = loadThresholds(db);
    const items = ratedItems(db, req.user.id, C, T);
    res.json(buildPassport(items, C, T));
  });

  // Подача достижения (создание или submit сразу)
  r.post('/achievements', auth, requireRole('member'), (req, res) => {
    const { catalogId, level, status, profileMpmk, kp, isTeam, eventDate, docUrl, submit } = req.body;
    const cat = db.prepare('SELECT * FROM catalog WHERE id=?').get(catalogId);
    if (!cat) return res.status(400).json({ error: 'Позиция каталога не найдена' });
    if (!LEVELS.includes(level) || !STATUSES.includes(status)) return res.status(400).json({ error: 'Некорректный уровень/статус' });
    const info = db.prepare('SELECT consentPd FROM users WHERE id=?').get(req.user.id);
    if (!info?.consentPd) return res.status(403).json({ error: 'Отсутствует согласие на обработку ПДн (152-ФЗ)' });

    const score = computeScore({ baseScore: cat.baseScore, level, status, kp: kp ?? cat.defaultKp, isTeam, blockCode: cat.blockCode }, loadCoefs(db));
    const st = submit ? 'submitted' : 'draft';
    const tx = db.transaction(() => {
      const i = db.prepare(`INSERT INTO achievements
        (userId, catalogId, blockCode, level, status, profileMpmk, kp, isTeam, eventDate, docUrl, computedScore, verifyState)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(req.user.id, catalogId, cat.blockCode, level, status, profileMpmk ?? cat.defaultProfile,
             kp ?? cat.defaultKp, isTeam ? 1 : 0, eventDate, docUrl || null, score, st);
      audit(db, req.user.login, 'achievement.create', 'achievement', i.lastInsertRowid, { level, status, score, st });
      return i.lastInsertRowid;
    });
    res.status(201).json({ id: tx() });
  });

  // Отправка черновика на верификацию / повторная после доработки
  r.post('/achievements/:id/submit', auth, requireRole('member'), (req, res) => {
    const a = db.prepare('SELECT * FROM achievements WHERE id=? AND userId=?').get(req.params.id, req.user.id);
    if (!a) return res.status(404).json({ error: 'Заявка не найдена' });
    if (!['draft', 'revision'].includes(a.verifyState)) return res.status(409).json({ error: 'Заявку нельзя отправить в текущем статусе' });
    db.prepare("UPDATE achievements SET verifyState='submitted', updatedAt=datetime('now') WHERE id=?").run(a.id);
    audit(db, req.user.login, 'achievement.submit', 'achievement', a.id);
    res.json({ ok: true });
  });

  // Очередь верификации — ТОЛЬКО заявки блоков своего отдела (row-level)
  r.get('/verify/queue', auth, requireRole('verifier'), (req, res) => {
    const blocks = verifierBlocks(db, req.user.id);
    if (!blocks.length) return res.json([]);
    const q = `SELECT a.*, c.name AS catalogName, c.baseScore, u.fullName AS applicant, b.name AS blockName
               FROM achievements a JOIN catalog c ON c.id=a.catalogId JOIN users u ON u.id=a.userId
               JOIN blocks b ON b.code=a.blockCode
               WHERE a.blockCode IN (${blocks.map(() => '?').join(',')})
                 AND a.verifyState IN ('submitted','in_review')`;
    const state = req.query.state;
    const rows = state
      ? db.prepare(q + ' AND a.verifyState=? ORDER BY a.createdAt').all(...blocks, state)
      : db.prepare(q + ' ORDER BY a.createdAt').all(...blocks);
    res.json(rows);
  });

  // Взять заявку в работу
  r.post('/verify/:id/take', auth, requireRole('verifier'), (req, res) => {
    const blocks = verifierBlocks(db, req.user.id);
    const a = db.prepare('SELECT * FROM achievements WHERE id=?').get(req.params.id);
    if (!a || !blocks.includes(a.blockCode)) return res.status(404).json({ error: 'Заявка не найдена в вашем блоке' });
    if (a.verifyState !== 'submitted') return res.status(409).json({ error: 'Заявка уже в работе' });
    db.prepare("UPDATE achievements SET verifyState='in_review', verifierId=?, updatedAt=datetime('now') WHERE id=?").run(req.user.id, a.id);
    audit(db, req.user.login, 'verify.take', 'achievement', a.id);
    res.json({ ok: true });
  });

  // Решение верификатора: approve | reject | revision (+ корректировка уровня/статуса → пересчёт)
  r.post('/verify/:id', auth, requireRole('verifier'), (req, res) => {
    const { decision, comment, level, status, kp } = req.body;
    if (!['approve', 'reject', 'revision'].includes(decision)) return res.status(400).json({ error: 'Некорректное решение' });
    const blocks = verifierBlocks(db, req.user.id);
    const a = db.prepare('SELECT * FROM achievements WHERE id=?').get(req.params.id);
    if (!a || !blocks.includes(a.blockCode)) return res.status(404).json({ error: 'Заявка не найдена в вашем блоке' });
    if (!['submitted', 'in_review'].includes(a.verifyState)) return res.status(409).json({ error: 'Заявка уже обработана' });

    let upd = { level: level && LEVELS.includes(level) ? level : a.level,
                status: status && STATUSES.includes(status) ? status : a.status,
                kp: kp != null ? Number(kp) : a.kp };
    const cat = db.prepare('SELECT baseScore FROM catalog WHERE id=?').get(a.catalogId);
    const newScore = computeScore({ ...upd, baseScore: cat.baseScore, isTeam: a.isTeam, blockCode: a.blockCode }, loadCoefs(db));
    const newState = { approve: 'approved', reject: 'rejected', revision: 'revision' }[decision];

    const tx = db.transaction(() => {
      db.prepare(`UPDATE achievements SET verifyState=?, verifierId=?, verifierComment=?,
                  level=?, status=?, kp=?, computedScore=?, updatedAt=datetime('now') WHERE id=?`)
        .run(newState, req.user.id, comment || null, upd.level, upd.status, upd.kp, newScore, a.id);
      audit(db, req.user.login, 'verify.' + decision, 'achievement', a.id,
            { oldScore: a.computedScore, newScore, changed: (upd.level !== a.level || upd.status !== a.status || upd.kp !== a.kp) });
    });
    tx();
    res.json({ ok: true, state: newState, computedScore: newScore });
  });

  return r;
};
