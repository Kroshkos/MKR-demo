'use strict';
/** Контур Б — закрытый: сводный рейтинг, паспорта, резерв, решения Совета, дашборд.
 *  Доступ: mkr_admin (полный), leadership (чтение+выгрузка), owner (полный).
 *  Читает approved-баллы из контура А; обратно ничего не передаёт. */
const express = require('express');
const { auth, requireRole, audit } = require('../middleware/auth');
const { loadCoefs, loadThresholds, ratedItems, buildPassport } = require('../engine');

module.exports = function (db) {
  const r = express.Router();
  const notify = (userId, type, title, body, link, kind = 'event') => {
    if (!userId) return;
    db.prepare('INSERT INTO notifications (userId, kind, type, title, body, link) VALUES (?,?,?,?,?,?)')
      .run(userId, kind, type, title, body || null, link || null);
  };
  const READ = requireRole('mkr_admin', 'leadership', 'owner');
  const WRITE = requireRole('mkr_admin', 'owner');

  // Сводный рейтинг: все обучающиеся, баллы, этап, профиль, ИУ/ИШ/Кг
  r.get('/rating', auth, READ, (req, res) => {
    const C = loadCoefs(db), T = loadThresholds(db);
    const members = db.prepare("SELECT id, fullName, track, course, profileMpmk FROM users WHERE role='member'").all();
    const rows = members.map(u => {
      const items = ratedItems(db, u.id, C, T);
      const p = buildPassport(items, C, T);
      const fixed = db.prepare('SELECT stage, councilNote FROM reserve WHERE userId=?').get(u.id);
      return {
        userId: u.id, fullName: u.fullName, track: u.track, course: u.course,
        total: p.total, autoStage: p.stage, stage: fixed?.stage || p.stage,
        iu: p.iu, ish: p.ish, kg: p.kg,
        dominantProfile: p.profileVector[0]?.profile || null,
        councilNote: fixed?.councilNote || null,
      };
    }).sort((a, b) => b.total - a.total);
    if (req.query.format === 'csv') {
      const head = 'Место;ФИО;Трек;Курс;Баллы;Этап;ИУ;ИШ;Кг\n';
      const csv = rows.map((x, i) => `${i + 1};${x.fullName};${x.track};${x.course};${x.total};${x.stage};${x.iu};${x.ish};${x.kg}`).join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      return res.send('\uFEFF' + head + csv);
    }
    res.json(rows);
  });

  // Паспорт конкретного резервиста (радар по 9 блокам, профиль-вектор, индексы)
  r.get('/passport/:userId', auth, READ, (req, res) => {
    const C = loadCoefs(db), T = loadThresholds(db);
    const uid = Number(req.params.userId);
    const u = db.prepare("SELECT id, fullName, track, course, profileMpmk FROM users WHERE id=? AND role='member'").get(uid);
    if (!u) return res.status(404).json({ error: 'Обучающийся не найден' });
    const items = ratedItems(db, uid, C, T);
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
    const reserve = db.prepare('SELECT r.*, au.fullName AS decidedBy FROM reserve r LEFT JOIN users au ON au.id=r.decidedBy WHERE r.userId=?').get(uid);
    const planRow = db.prepare('SELECT * FROM development_plans WHERE userId=?').get(uid);
    const plan = planRow ? { goals: JSON.parse(planRow.goals || '[]'), mentor: planRow.mentor, focus: planRow.focus, updatedAt: planRow.updatedAt } : null;
    // Личное дело (контур Б): характеристика, благодарности, взыскания, участия в мероприятиях
    const records = db.prepare(`SELECT pr.*, au.fullName AS authorName FROM personal_records pr
                                LEFT JOIN users au ON au.id=pr.authorId
                                WHERE pr.userId=? ORDER BY pr.kind, pr.eventDate DESC, pr.id DESC`).all(uid);
    res.json({ user: u, ...p, radar, profileVectorNamed: vector, reserve, plan, records,
      achievements: items.map(i => ({ name: i.catalogName, block: i.blockCode, level: i.level, status: i.status, score: i.computedScore, date: i.eventDate })) });
  });

  // ---- Личное дело: CRUD-разделы (заполняет руководство факультета) ----------
  const REC_KINDS = ['characteristic', 'gratitude', 'discipline', 'event_participation'];

  r.get('/records/:userId', auth, READ, (req, res) => {
    const uid = Number(req.params.userId);
    const rows = db.prepare(`SELECT pr.*, au.fullName AS authorName FROM personal_records pr
                             LEFT JOIN users au ON au.id=pr.authorId
                             WHERE pr.userId=? ORDER BY pr.kind, pr.eventDate DESC, pr.id DESC`).all(uid);
    res.json(rows);
  });

  r.post('/records/:userId', auth, requireRole('leadership', 'owner'), (req, res) => {
    const uid = Number(req.params.userId);
    const u = db.prepare("SELECT id, fullName FROM users WHERE id=? AND role='member'").get(uid);
    if (!u) return res.status(404).json({ error: 'Обучающийся не найден' });
    const { kind, title, body, eventDate } = req.body;
    if (!REC_KINDS.includes(kind)) return res.status(400).json({ error: 'Некорректный раздел личного дела' });
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Укажите название записи' });
    if (eventDate && !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return res.status(400).json({ error: 'Дата в формате yyyy-mm-dd' });
    const info = db.prepare('INSERT INTO personal_records (userId, kind, title, body, eventDate, authorId) VALUES (?,?,?,?,?,?)')
      .run(uid, kind, String(title).slice(0, 200), body ? String(body).slice(0, 4000) : null, eventDate || null, req.user.id);
    audit(db, req.user.login, 'record.add', 'personal_records', info.lastInsertRowid, { userId: uid, kind });
    res.json({ ok: true, id: info.lastInsertRowid });
  });

  r.put('/records/:userId/:id', auth, requireRole('leadership', 'owner'), (req, res) => {
    const uid = Number(req.params.userId);
    const rec = db.prepare('SELECT * FROM personal_records WHERE id=? AND userId=?').get(Number(req.params.id), uid);
    if (!rec) return res.status(404).json({ error: 'Запись не найдена' });
    const { title, body, eventDate, kind } = req.body;
    if (kind && !REC_KINDS.includes(kind)) return res.status(400).json({ error: 'Некорректный раздел' });
    db.prepare(`UPDATE personal_records SET title=?, body=?, eventDate=?, kind=?, updatedAt=datetime('now') WHERE id=?`)
      .run(title != null ? String(title).slice(0, 200) : rec.title,
           body != null ? String(body).slice(0, 4000) : rec.body,
           eventDate != null ? eventDate : rec.eventDate,
           kind || rec.kind, rec.id);
    audit(db, req.user.login, 'record.update', 'personal_records', rec.id, { userId: uid });
    res.json({ ok: true });
  });

  r.delete('/records/:userId/:id', auth, requireRole('leadership', 'owner'), (req, res) => {
    const uid = Number(req.params.userId);
    const rec = db.prepare('SELECT * FROM personal_records WHERE id=? AND userId=?').get(Number(req.params.id), uid);
    if (!rec) return res.status(404).json({ error: 'Запись не найдена' });
    db.prepare('DELETE FROM personal_records WHERE id=?').run(rec.id);
    audit(db, req.user.login, 'record.delete', 'personal_records', rec.id, { userId: uid, kind: rec.kind });
    res.json({ ok: true });
  });

  // Фиксация решения Совета / этапа резерва (только запись в контур Б)
  r.post('/reserve/:userId', auth, WRITE, (req, res) => {
    const uid = Number(req.params.userId);
    const { stage, councilNote } = req.body;
    if (!['Участник', 'Кандидат', 'Резидент'].includes(stage)) return res.status(400).json({ error: 'Некорректный этап' });
    const u = db.prepare('SELECT id FROM users WHERE id=? AND role=\'member\'').get(uid);
    if (!u) return res.status(404).json({ error: 'Обучающийся не найден' });
    const oldStage = db.prepare('SELECT stage FROM reserve WHERE userId=?').get(uid)?.stage;
    db.prepare(`INSERT INTO reserve (userId, stage, councilNote, decidedBy, decidedAt) VALUES (?,?,?,?,datetime('now'))
                ON CONFLICT(userId) DO UPDATE SET stage=excluded.stage, councilNote=excluded.councilNote,
                decidedBy=excluded.decidedBy, decidedAt=excluded.decidedAt`)
      .run(uid, stage, councilNote || null, req.user.id);
    audit(db, req.user.login, 'reserve.decision', 'reserve', uid, { stage, councilNote });
    notify(uid, 'council.decision', `Решение Совета МКР: этап «${stage}»`,
      councilNote || 'Примечание не указано.', '#/me/passport');
    if (oldStage && oldStage !== stage) {
      notify(uid, 'stage.change', `Этап резерва изменён: ${oldStage} → ${stage}`,
        'Зафиксировано решением Совета МКР.', '#/me/passport');
    }
    res.json({ ok: true });
  });

  // План развития резервиста (ведение — админ МКР/владелец; курсант видит его в своём паспорте)
  r.put('/plan/:userId', auth, WRITE, (req, res) => {
    const uid = Number(req.params.userId);
    const u = db.prepare('SELECT id, fullName FROM users WHERE id=? AND role=\'member\'').get(uid);
    if (!u) return res.status(404).json({ error: 'Обучающийся не найден' });
    const { goals, mentor, focus } = req.body;
    if (!Array.isArray(goals)) return res.status(400).json({ error: 'goals должен быть массивом' });
    const clean = goals.slice(0, 20).map(g => ({ text: String(g.text || '').slice(0, 300), done: !!g.done }));
    db.prepare(`INSERT INTO development_plans (userId, goals, mentor, focus, updatedAt, updatedBy)
                VALUES (?,?,?,?,datetime('now'),?)
                ON CONFLICT(userId) DO UPDATE SET goals=excluded.goals, mentor=excluded.mentor,
                focus=excluded.focus, updatedAt=excluded.updatedAt, updatedBy=excluded.updatedBy`)
      .run(uid, JSON.stringify(clean), mentor || null, focus || null, req.user.id);
    audit(db, req.user.login, 'plan.update', 'development_plans', uid, { count: clean.length });
    notify(uid, 'plan.update', 'Обновлён ваш план развития',
      focus ? `Фокус: ${focus}.` : 'Наставник внес изменения в план целей.', '#/me/passport');
    res.json({ ok: true });
  });

  // Дашборд МКР: воронка Участник → Кандидат → Резидент, счётчики
  r.get('/dashboard', auth, READ, (req, res) => {
    const C = loadCoefs(db), T = loadThresholds(db);
    const members = db.prepare("SELECT id FROM users WHERE role='member'").all();
    const funnel = { Участник: 0, Кандидат: 0, Резидент: 0 };
    for (const m of members) {
      const p = buildPassport(ratedItems(db, m.id, C, T), C, T);
      const fixed = db.prepare('SELECT stage FROM reserve WHERE userId=?').get(m.id);
      funnel[fixed?.stage || p.stage]++;
    }
    const pending = db.prepare("SELECT COUNT(*) n FROM achievements WHERE verifyState IN ('submitted','in_review')").get().n;
    const approved = db.prepare("SELECT COUNT(*) n FROM achievements WHERE verifyState='approved'").get().n;

    // Динамика: сравнение с предыдущим снимком рейтинга (таблица rating_snapshots — в схеме)
    const prevSnapRow = db.prepare('SELECT snap FROM rating_snapshots ORDER BY id DESC LIMIT 1').get();
    const prev = prevSnapRow ? JSON.parse(prevSnapRow.snap) : null;
    const ranked = members.map(m => {
      const p2 = buildPassport(ratedItems(db, m.id, C, T), C, T);
      return { userId: m.id, total: p2.total };
    }).sort((a, b) => b.total - a.total);
    const curMap = Object.fromEntries(ranked.map((x, i) => [x.userId, { rank: i + 1, total: x.total }]));
    db.prepare('INSERT INTO rating_snapshots (snap) VALUES (?)').run(JSON.stringify(curMap));
    const dynamics = prev ? ranked.map(x => ({
      userId: x.userId,
      deltaRank: (prev[x.userId]?.rank ?? null) ? prev[x.userId].rank - curMap[x.userId].rank : null,
      deltaScore: (prev[x.userId] != null) ? Math.round((x.total - prev[x.userId].total) * 10) / 10 : null,
    })) : [];
    const decisions = db.prepare(`SELECT r.userId, u.fullName, r.stage, r.councilNote, r.decidedAt, au.fullName AS decidedBy
                                  FROM reserve r JOIN users u ON u.id=r.userId LEFT JOIN users au ON au.id=r.decidedBy
                                  ORDER BY r.decidedAt DESC LIMIT 5`).all();
    res.json({ funnel, counters: { members: members.length, pendingVerifications: pending, approvedAchievements: approved },
      dynamics, hasBaseline: !!prev, decisions });
  });

  return r;
};
