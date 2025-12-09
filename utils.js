const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { get, run } = require('./db');

const SECRET = process.env.JWT_SECRET || 'dev-secret';
const SESSION_IDLE_MINUTES = Number(process.env.SESSION_IDLE_MINUTES || 30);
const SESSION_SHORT_HOURS = Number(process.env.SESSION_SHORT_HOURS || 2);
const SESSION_LONG_DAYS = Number(process.env.SESSION_LONG_DAYS || 30);

function newJti() {
  return crypto.randomBytes(16).toString('hex');
}

function signToken(payload, { remember = false, jti } = {}) {
  const expiresIn = remember ? `${SESSION_LONG_DAYS}d` : `${SESSION_SHORT_HOURS}h`;
  const tokenJti = jti || payload.jti || newJti();
  return jwt.sign({ ...payload, jti: tokenJti }, SECRET, { expiresIn });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizePhone(phone) {
  const cleaned = String(phone || '').replace(/[^0-9+]/g, '').trim();
  return cleaned ? cleaned : null;
}

function sendSuccess(res, data, status = 200) {
  return res.status(status).json({ success: true, data, error: null });
}

function sendError(res, message, code = 'bad_request', status = 400) {
  return res.status(status).json({ success: false, data: null, error: { message, code } });
}

async function assertActiveSession(jti, userId) {
  if (!jti) throw new Error('Missing session');
  const nowIso = new Date().toISOString();
  const session = await get('SELECT * FROM sessions WHERE jti = ? AND userId = ?', [jti, userId]);
  if (!session) throw new Error('Session not found');
  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    await run('DELETE FROM sessions WHERE jti = ?', [jti]);
    throw new Error('Session expired');
  }
  const idleMs = SESSION_IDLE_MINUTES * 60 * 1000;
  if (Date.now() - new Date(session.lastActive).getTime() > idleMs) {
    await run('DELETE FROM sessions WHERE jti = ?', [jti]);
    throw new Error('Session idle timeout');
  }
  await run('UPDATE sessions SET lastActive = ? WHERE jti = ?', [nowIso, jti]);
  return session;
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.split(' ')[1];
  if (!token) return sendError(res, 'Unauthorized', 'unauthorized', 401);
  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    return sendError(res, 'Unauthorized', 'unauthorized', 401);
  }
  assertActiveSession(payload.jti, payload.id)
    .then(() => {
      req.user = payload;
      next();
    })
    .catch((err) => {
      const msg = err?.message?.toLowerCase().includes('missing session')
        ? 'Session ended (signed in elsewhere)'
        : err?.message || 'Unauthorized';
      const code = err?.message?.toLowerCase().includes('session') ? 'session_revoked' : 'unauthorized';
      sendError(res, msg, code, 401);
    });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return sendError(res, 'Forbidden', 'forbidden', 403);
    }
    return next();
  };
}

module.exports = {
  signToken,
  verifyToken,
  sendSuccess,
  sendError,
  authMiddleware,
  requireRole,
  normalizeEmail,
  normalizeText,
  normalizePhone,
  newJti,
  assertActiveSession
};
