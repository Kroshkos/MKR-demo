'use strict';
/** Настройки (sysadmin): коэффициенты М/С/Кп, пороги, справочники, привязка отделов, аудит.
 *  ВАЖНО: sysadmin НЕ видит паспортные данные резервистов и решения Совета (контур Б закрыт). */
const express = require('express');
const { auth, requireRole, audit } = require('../middleware/auth');

module.exports = function (db) {
  const r = express.Router();
  const ADMIN = requireRole('sysadmin', 'owner');

  r.get('/coefficients', auth, ADMIN, (req, res) => {
    res.json(db.prepare('SELECT kind, key, value FROM coefficients ORDER BY kind, id').all());
  });

  r.put('/coefficients', auth, ADMIN, (req, res) => {
    const items = req.body.items || [];
    const tx = db.transaction(() => {
      for (const it of items) {
        if (!['M', 'C', 'Kp'].includes(it.kind)) continue;
        db.prepare(`INSERT INTO coefficients (kind,key,value) VALUES (?,?,?)
                    ON CONFLICT(kind,key) DO UPDATE SET value=excluded.value`)
          .run(it.kind, it.key, Number(it.value));
        audit(db, req.user.login, 'coefficient.update', 'coefficients', `${it.kind}:${it.key}`, { value: it.value });
      }
    });
    tx();
    res.json({ ok: true });
  });

  r.get('/thresholds', auth, ADMIN, (req, res) => res.json(db.prepare('SELECT * FROM thresholds').all()));

  r.put('/thresholds', auth, ADMIN, (req, res) => {
    const items = req.body.items || [];
    const tx = db.transaction(() => {
      for (const it of items) {
        db.prepare(`INSERT INTO thresholds (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
          .run(it.key, Number(it.value));
        audit(db, req.user.login, 'threshold.update', 'thresholds', it.key, { value: it.value });
      }
    });
    tx();
    res.json({ ok: true });
  });

  r.get('/blocks', auth, ADMIN, (req, res) => res.json(db.prepare('SELECT * FROM blocks ORDER BY code').all()));
  r.get('/profiles', auth, ADMIN, (req, res) => res.json(db.prepare('SELECT * FROM profiles_mpmk').all()));
  r.get('/departments', auth, ADMIN, (req, res) =>
    res.json(db.prepare('SELECT * FROM departments ORDER BY id').all().map(d => ({ ...d, blockCodes: JSON.parse(d.blockCodes) }))));

  // Привязка блоков к отделу
  r.put('/departments/:id', auth, ADMIN, (req, res) => {
    const { blockCodes } = req.body;
    if (!Array.isArray(blockCodes)) return res.status(400).json({ error: 'blockCodes должен быть массивом' });
    db.prepare('UPDATE departments SET blockCodes=? WHERE id=?').run(JSON.stringify(blockCodes), req.params.id);
    audit(db, req.user.login, 'department.bindBlocks', 'departments', req.params.id, { blockCodes });
    res.json({ ok: true });
  });

  // Управление пользователями (owner)
  r.get('/users', auth, requireRole('owner'), (req, res) =>
    res.json(db.prepare('SELECT id, fullName, login, role, departmentId, track, course, profileMpmk, consentPd FROM users').all()));

  // Журнал аудита — sysadmin и owner
  r.get('/audit', auth, requireRole('sysadmin', 'owner'), (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    res.json(db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit));
  });

  return r;
};
