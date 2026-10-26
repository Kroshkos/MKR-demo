'use strict';
/** Аутентификация (JWT в cookie) и RBAC-middleware с разграничением на уровне строк. */
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET || 'mkr-dev-secret-change-in-prod';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  // Amvera: задайте JWT_SECRET в «Конфигурация → Переменные». Dev-секрет публично известен в репозитории.
  console.warn('[auth] ВНИМАНИЕ: NODE_ENV=production, но JWT_SECRET не задан — используется dev-секрет. Задайте JWT_SECRET в переменных окружения Amvera.');
}

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role, login: user.login }, SECRET, { expiresIn: '8h' });
}

function auth(req, res, next) {
  const token = req.cookies?.mkr_token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Не авторизован' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Сессия истекла, войдите заново' });
  }
}

/** Ограничение по ролям. Контур Б недоступен member/verifier/sysadmin — см. ТЗ раздел 9. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Доступ запрещён (роль не имеет прав)' });
    next();
  };
}

/** Блоки тематические, закреплённые за отделом верификатора. */
function verifierBlocks(db, userId) {
  const u = db.prepare('SELECT departmentId FROM users WHERE id=?').get(userId);
  if (!u || !u.departmentId) return [];
  const dep = db.prepare('SELECT blockCodes FROM departments WHERE id=?').get(u.departmentId);
  return dep ? JSON.parse(dep.blockCodes) : [];
}

function audit(db, actor, action, entity, entityId, payload) {
  db.prepare('INSERT INTO audit_log (actor, action, entity, entityId, payload) VALUES (?,?,?,?,?)')
    .run(String(actor), action, entity, String(entityId ?? ''), payload ? JSON.stringify(payload) : null);
}

module.exports = { sign, auth, requireRole, verifierBlocks, audit, hash: (pw) => crypto.scryptSync(pw, 'mkr-salt', 32).toString('hex') };
