'use strict';
/** Контур А — достижения курсантов и распределённая верификация профильными отделами. */
const express = require('express');
const { auth, requireRole, verifierBlocks, audit } = require('../middleware/auth');
const { computeScore, loadCoefs, loadThresholds, ratedItems, buildPassport, stageFor, LEVELS, STATUSES } = require('../engine');

module.exports = function (db) {
  const r = express.Router();

  // Уведомления: свои (любая роль) + колокольчик
  const notify = (userId, type, title, body, link, kind = 'event') => {
    if (!userId) return;
    db.prepare('INSERT INTO notifications (userId, kind, type, title, body, link) VALUES (?,?,?,?,?,?)')
      .run(userId, kind, type, title, body || null, link || null);
  };
  const notifyVerifiersOfBlock = (blockCode, ...args) => {
    const rows = db.prepare(`SELECT u.id FROM users u JOIN departments d ON d.id=u.departmentId
                             WHERE u.role='verifier' AND d.blockCodes LIKE ?`).all(`%${blockCode}%`);
    for (const v of rows) notify(v.id, ...args);
  };

  r.get('/notifications', auth, (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const items = db.prepare('SELECT * FROM notifications WHERE userId=? ORDER BY id DESC LIMIT ?').all(req.user.id, limit);
    const unread = db.prepare('SELECT COUNT(*) n FROM notifications WHERE userId=? AND readAt IS NULL').get(req.user.id).n;
    res.json({ items, unread });
  });

  r.post('/notifications/read', auth, (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : null;
    if (ids && ids.length) {
      db.prepare(`UPDATE notifications SET readAt=datetime('now') WHERE userId=? AND readAt IS NULL AND id IN (${ids.map(() => '?').join(',')})`)
        .run(req.user.id, ...ids.map(Number));
    } else {
      db.prepare("UPDATE notifications SET readAt=datetime('now') WHERE userId=? AND readAt IS NULL").run(req.user.id);
    }
    res.json({ ok: true });
  });

  // Справочник позиций каталога (автоподстановка база/Кп/профиль)
  r.get('/catalog', auth, (req, res) => {
    const track = req.query.track;
    const rows = track
      ? db.prepare('SELECT * FROM catalog WHERE track=? OR track=\'Общий\'').all(track)
      : db.prepare('SELECT * FROM catalog').all();
    res.json(rows);
  });

  r.get('/levels', auth, (req, res) => res.json({ levels: LEVELS, statuses: STATUSES }));

  // Мои достижения (member — только свои, row-level) + прогресс до следующего этапа
  r.get('/me/achievements', auth, requireRole('member'), (req, res) => {
    const C = loadCoefs(db), T = loadThresholds(db);
    // Безопасность контура А: учащийся НЕ видит ФИО в привязке к месту хранения документа
    // и путь прикрепления docUrl — только отображаемое имя документа docName.
    const rows = db.prepare(`
      SELECT a.id, a.catalogId, a.blockCode, a.level, a.status, a.profileMpmk, a.kp, a.isTeam,
             a.eventDate, a.docName, a.computedScore, a.verifyState, a.verifierComment,
             a.createdAt, a.updatedAt,
             c.name AS catalogName, c.baseScore, c.isThesis, b.name AS blockName
      FROM achievements a JOIN catalog c ON c.id=a.catalogId JOIN blocks b ON b.code=a.blockCode
      WHERE a.userId=? ORDER BY a.createdAt DESC`).all(req.user.id);
    const items = ratedItems(db, req.user.id, C, T);
    const passport = buildPassport(items, C, T);
    res.json({ achievements: rows, myTotal: passport.total, myStage: passport.stage, thresholds: T });
  });

  // Мой упрощённый паспорт (member видит только свой) + план развития и история этапов
  r.get('/me/passport', auth, requireRole('member'), (req, res) => {
    const C = loadCoefs(db), T = loadThresholds(db);
    const items = ratedItems(db, req.user.id, C, T);
    const p = buildPassport(items, C, T);
    const blocks = db.prepare('SELECT code, name, ceiling FROM blocks ORDER BY code').all();
    const profiles = db.prepare('SELECT code, name FROM profiles_mpmk').all();
    const radar = blocks.map(b => {
      const e = p.byBlock.find(x => x.block === b.code);
      return { block: b.code, name: b.name, ceiling: b.ceiling, points: e ? e.points : 0, pct: e ? e.pct : 0 };
    });
    const vector = profiles.map(pr => {
      const e = p.profileVector.find(x => x.profile === pr.code);
      return { code: pr.code, name: pr.name, points: e ? e.points : 0, pct: e ? e.pct : 0 };
    });
    const planRow = db.prepare('SELECT * FROM development_plans WHERE userId=?').get(req.user.id);
    const plan = planRow ? { goals: JSON.parse(planRow.goals || '[]'), mentor: planRow.mentor, focus: planRow.focus, updatedAt: planRow.updatedAt } : null;
    const reserve = db.prepare('SELECT stage, councilNote, decidedAt FROM reserve WHERE userId=?').get(req.user.id);
    // Анонимизация аккаунта обучающегося: без ФИО и без места прикрепления документов.
    const u = db.prepare('SELECT track, course, profileMpmk FROM users WHERE id=?').get(req.user.id);
    res.json({ user: u, anon: true, ...p, radar, profileVectorNamed: vector, plan, reserveFixed: reserve || null,
      achievements: items.map(i => ({ name: i.catalogName, block: i.blockCode, level: i.level, status: i.status, score: i.computedScore, date: i.eventDate })) });
  });

  // Подача достижения (создание или submit сразу)
  r.post('/achievements', auth, requireRole('member'), (req, res) => {
    const { catalogId, level, status, profileMpmk, kp, isTeam, eventDate, docName, docUrl, submit } = req.body;
    const cat = db.prepare('SELECT * FROM catalog WHERE id=?').get(catalogId);
    if (!cat) return res.status(400).json({ error: 'Позиция каталога не найдена' });
    if (!LEVELS.includes(level) || !STATUSES.includes(status)) return res.status(400).json({ error: 'Некорректный уровень/статус' });
    const info = db.prepare('SELECT consentPd FROM users WHERE id=?').get(req.user.id);
    if (!info?.consentPd) return res.status(403).json({ error: 'Отсутствует согласие на обработку ПДн (152-ФЗ)' });

    const score = computeScore({ baseScore: cat.baseScore, level, status, kp: kp ?? cat.defaultKp, isTeam, blockCode: cat.blockCode }, loadCoefs(db));
    const st = submit ? 'submitted' : 'draft';
    const tx = db.transaction(() => {
      // docUrl — служебное место прикрепления в защищённом хранилище: участнику не возвращается.
      const i = db.prepare(`INSERT INTO achievements
        (userId, catalogId, blockCode, level, status, profileMpmk, kp, isTeam, eventDate, docName, docUrl, computedScore, verifyState)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(req.user.id, catalogId, cat.blockCode, level, status, profileMpmk ?? cat.defaultProfile,
             kp ?? cat.defaultKp, isTeam ? 1 : 0, eventDate, docName ? String(docName).slice(0, 200) : null, docUrl || null, score, st);
      audit(db, req.user.login, 'achievement.create', 'achievement', i.lastInsertRowid, { level, status, score, st });
      if (submit) notifyVerifiersOfBlock(cat.blockCode, 'verify.new', 'Новая заявка на верификацию',
        `${req.user.fullName}: «${cat.name}» (~${score} б.)`, '#/verify');
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
    notifyVerifiersOfBlock(a.blockCode, 'verify.new', 'Новая заявка на верификацию',
      `${req.user.fullName}: «${db.prepare('SELECT name FROM catalog WHERE id=?').get(a.catalogId)?.name}» (~${a.computedScore} б.)`, '#/verify');
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
      // Уведомление заявителю о решении + пересчёт этапа (повышение — отдельное уведомление)
      const C = loadCoefs(db), T = loadThresholds(db);
      const beforeStage = buildPassport(ratedItems(db, a.userId, C, T), C, T).stage;
      let afterStage = beforeStage;
      if (decision === 'approve') {
        afterStage = stageFor(
          ratedItems(db, a.userId, C, T).reduce((s, x) => s + x.computedScore, 0) - a.computedScore + newScore, T);
      }
      const titles = { approve: 'Достижение зачтено', reject: 'Заявка отклонена', revision: 'Заявка отправлена на доработку' };
      notify(a.userId, 'verify.decision', titles[decision],
        `«${db.prepare('SELECT name FROM catalog WHERE id=?').get(a.catalogId)?.name}»: ${newScore} б.` +
        (comment ? `. Комментарий: ${comment}` : ''), '#/me');
      if (decision === 'approve' && afterStage !== beforeStage) {
        notify(a.userId, 'stage.up', `Новый этап: ${afterStage}`,
          `Поздравляем! Ваш суммарный балл перевёл вас в статус «${afterStage}».`, '#/me/passport');
      }
    });
    tx();
    res.json({ ok: true, state: newState, computedScore: newScore });
  });

  return r;
};
