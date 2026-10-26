'use strict';
/** Аутентификация: вход по логину/паролю (в продуктиве — СЭД/AD/Госуслуги), JWT в httpOnly-cookie. */
const express = require('express');
const crypto = require('crypto');
const { sign, auth, audit } = require('../middleware/auth');

const hash = (pw) => crypto.scryptSync(pw, 'mkr-salt', 32).toString('hex');

module.exports = function (db) {
  const r = express.Router();

  r.post('/login', (req, res) => {
    const { login, password } = req.body || {};
    const u = db.prepare('SELECT * FROM users WHERE login=?').get(login || '');
    if (!u || u.passwordHash !== hash(password || '')) {
      audit(db, login || '?', 'login.failed', 'users', null);
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }
    const token = sign(u);
    res.cookie('mkr_token', token, {
      httpOnly: true, sameSite: 'lax', maxAge: 8 * 3600 * 1000,
      secure: process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https', // Amvera отдаёт HTTPS за прокси
    });
    audit(db, u.login, 'login', 'users', u.id, { role: u.role });
    res.json({ id: u.id, fullName: u.fullName, role: u.role, departmentId: u.departmentId, track: u.track });
  });

  r.get('/me', auth, (req, res) => {
    const u = db.prepare('SELECT id, fullName, login, role, departmentId, track, course, profileMpmk, consentPd FROM users WHERE id=?').get(req.user.id);
    res.json(u);
  });

  r.post('/logout', auth, (req, res) => {
    res.clearCookie('mkr_token');
    audit(db, req.user.login, 'logout', 'users', req.user.id);
    res.json({ ok: true });
  });

  return r;
};
