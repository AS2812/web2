const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (_) { nodemailer = null; }
const { get, run } = require('../db');
const {
  signToken,
  sendSuccess,
  sendError,
  authMiddleware,
  normalizeEmail,
  normalizeText,
  normalizePhone,
  newJti,
  isValidPhone
} = require('../utils');

const router = express.Router();

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const REMEMBER_EXPIRY_DAYS = Number(process.env.SESSION_LONG_DAYS || 30);
const SHORT_SESSION_HOURS = Number(process.env.SESSION_SHORT_HOURS || 2);
const RESET_EXPIRY_MINUTES = Number(process.env.RESET_EXPIRY_MINUTES || 30);

function validatePassword(password) {
  return PASSWORD_RULE.test(password || '');
}

async function activeSessionForUser(userId) {
  const nowIso = new Date().toISOString();
  await run('DELETE FROM sessions WHERE datetime(expiresAt) <= datetime(?)', [nowIso]);
  return get(
    'SELECT * FROM sessions WHERE userId = ? AND datetime(expiresAt) > datetime(?) ORDER BY datetime(expiresAt) DESC LIMIT 1',
    [userId, nowIso]
  );
}

async function createSession(userId, remember) {
  const jti = newJti();
  const now = new Date();
  const expires = new Date(remember ? now.getTime() + REMEMBER_EXPIRY_DAYS * 24 * 60 * 60 * 1000 : now.getTime() + SHORT_SESSION_HOURS * 60 * 60 * 1000);
  await run(
    `INSERT INTO sessions (jti, userId, expiresAt, lastActive, rememberMe, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
    [jti, userId, expires.toISOString(), now.toISOString(), remember ? 1 : 0, now.toISOString()]
  );
  return jti;
}

async function sendResetEmail(email, token) {
  const resetLink = `${process.env.FRONTEND_URL || ''}/reset-password?token=${encodeURIComponent(token)}`;
  
  // Check if nodemailer is available
  if (!nodemailer) {
    console.log('⚠️  Nodemailer not installed - using console fallback');
    console.log(`📧 Password reset link for ${email}: ${resetLink}`);
    return { sent: false, token, link: resetLink };
  }
  
  // Check if SMTP is configured
  if (!process.env.SMTP_USER) {
    console.log('⚠️  SMTP_USER not configured - using console fallback');
    console.log(`📧 Password reset link for ${email}: ${resetLink}`);
    return { sent: false, token, link: resetLink };
  }
  
  if (!process.env.SMTP_PASS) {
    console.log('⚠️  SMTP_PASS not configured - using console fallback');
    console.log(`📧 Password reset link for ${email}: ${resetLink}`);
    return { sent: false, token, link: resetLink };
  }
  
  // Log SMTP configuration (without sensitive data)
  const smtpConfig = {
    service: process.env.SMTP_SERVICE || 'gmail',
    port: 587,
    secure: false,
    user: process.env.SMTP_USER,
    from: process.env.SMTP_FROM || process.env.SMTP_USER 
  };
  
  console.log('📤 SMTP Configuration:', {
    service: smtpConfig.service,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    user: smtpConfig.user,
    from: smtpConfig.from
  });
  
  const transporter = nodemailer.createTransport({
    service: smtpConfig.service,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  
  // Verify SMTP connection
  try {
    console.log('🔌 Testing SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection verified successfully');
  } catch (verifyErr) {
    console.error('❌ SMTP connection verification failed:', verifyErr.message);
    console.error('   Error code:', verifyErr.code);
    console.error('   Full error:', verifyErr);
    console.log(`📧 Fallback: Password reset link for ${email}: ${resetLink}`);
    return { sent: false, token, link: resetLink };
  }
  
  const message = {
    from: smtpConfig.from,
    to: email,
    subject: 'Password reset',
    text: `Use this link to reset your password: ${resetLink}`,
    html: `<p>Use this link to reset your password:</p><p><a href="${resetLink}">${resetLink}</a></p>`
  };
  
  console.log('📨 Sending password reset email...');
  console.log('   To:', email);
  console.log('   From:', message.from);
  console.log('   Subject:', message.subject);
  
  try {
    const info = await transporter.sendMail(message);
    console.log('✅ Email sent successfully!');
    console.log('   Message ID:', info.messageId);
    console.log('   Response:', info.response);
    return { sent: true, token, link: resetLink };
  } catch (err) {
    console.error('❌ Email send failed:');
    console.error('   Error message:', err.message);
    console.error('   Error code:', err.code);
    console.error('   Command:', err.command);
    
    // Log specific error details
    if (err.code === 'EAUTH') {
      console.error('   ⚠️  Authentication failed - check SMTP_USER and SMTP_PASS');
      console.error('   ⚠️  For Gmail, you need an App Password (not your regular password)');
    } else if (err.code === 'ESOCKET') {
      console.error('   ⚠️  Connection failed - check network/firewall settings');
    } else if (err.code === 'ETIMEDOUT') {
      console.error('   ⚠️  Connection timeout - SMTP server may be unreachable');
    }
    
    console.error('   Full error:', err);
    console.log(`📧 Fallback: Password reset link for ${email}: ${resetLink}`);
    return { sent: false, token, link: resetLink };
  }
}

router.post('/register', async (req, res) => {
  const { username, email, password, name, address, phone } = req.body || {};
  if (!username || !password || !name || !email) {
    return sendError(res, 'username, email, password, and name are required');
  }
  if (!validatePassword(password)) {
    return sendError(res, 'Invalid password: must be 8+ characters with letters and numbers');
  }
  const normalizedEmail = normalizeEmail(email);
  const normalizedUsername = normalizeText(username).toLowerCase();
  const normalizedFullName = normalizeText(name).toLowerCase();
  const normalizedPhone = normalizePhone(phone || null) || null;
  if (normalizedPhone && !isValidPhone(normalizedPhone)) return sendError(res, 'Invalid phone number');
  try {
    const conflict = await get(
      `SELECT username, email, phone, fullName FROM users WHERE lower(username) = ? OR lower(email) = ? OR phone = ? OR lower(fullName) = ?`,
      [normalizedUsername, normalizedEmail, normalizedPhone, normalizedFullName]
    );
    if (conflict) {
      if (conflict.email && normalizeEmail(conflict.email) === normalizedEmail) return sendError(res, 'Email is already registered', 'conflict', 409);
      if (conflict.phone && conflict.phone === normalizedPhone) return sendError(res, 'Phone number is already registered', 'conflict', 409);
      if (conflict.fullName && normalizeText(conflict.fullName).toLowerCase() === normalizedFullName) return sendError(res, 'Full name is already registered', 'conflict', 409);
      return sendError(res, 'Username is already taken', 'conflict', 409);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userRes = await run(
      `INSERT INTO users (username, email, passwordHash, role, fullName, phone) VALUES (?, ?, ?, 'Member', ?, ?)`,
      [normalizedUsername, normalizedEmail, passwordHash, normalizeText(name), normalizedPhone]
    );
    await run(`INSERT INTO members (userId, name, address) VALUES (?, ?, ?)`, [
      userRes.id,
      normalizeText(name),
      address ? normalizeText(address) : null
    ]);
    const remember = Boolean(req.body?.remember);
    const jti = await createSession(userRes.id, remember);
    const token = signToken({ id: userRes.id, role: 'Member', jti }, { remember });
    const user = await get('SELECT id, username, email, role, fullName, phone FROM users WHERE id = ?', [
      userRes.id
    ]);
    return sendSuccess(res, { token, user }, 201);
  } catch (err) {
    console.error(err);
    return sendError(res, 'Registration failed');
  }
});

router.post('/login', async (req, res) => {
  const { username, password, remember } = req.body || {};
  if (!username || !password) return sendError(res, 'username and password are required');
  try {
    const user = await get('SELECT * FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?)', [username, username]);
    if (!user) return sendError(res, 'Invalid credentials', 'unauthorized', 401);
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return sendError(res, 'Invalid credentials', 'unauthorized', 401);

    const activeSession = await activeSessionForUser(user.id);
    if (activeSession?.jti) {
      // Replace existing session immediately
      await run('DELETE FROM sessions WHERE jti = ?', [activeSession.jti]);
    }

    const rememberFlag = Boolean(remember);
    const jti = await createSession(user.id, rememberFlag);
    const token = signToken({ id: user.id, role: user.role, jti }, { remember: rememberFlag });
    const safeUser = sanitizeUser(user);
    return sendSuccess(res, { token, user: safeUser });
  } catch (err) {
    console.error(err);
    return sendError(res, 'Login failed');
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!user) return sendError(res, 'User not found', 'not_found', 404);
    const member = await get('SELECT memberId FROM members WHERE userId = ?', [user.id]);
    const admin = await get('SELECT staffCode FROM admin_users WHERE userId = ?', [user.id]);
    return sendSuccess(res, {
      user: sanitizeUser(user),
      memberId: member?.memberId || null,
      staffCode: admin?.staffCode || null
    });
  } catch (err) {
    console.error(err);
    return sendError(res, 'Failed to fetch profile');
  }
});

router.post('/logout', authMiddleware, (_req, res) => {
  // Stateless JWT: client drops token plus session removed server-side.
  const jti = _req.user?.jti;
  if (jti) {
    run('DELETE FROM sessions WHERE jti = ?', [jti]).catch(() => {});
  }
  return sendSuccess(res, { message: 'Logged out' });
});

router.post('/forgot', async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email) return sendError(res, 'Email is required');
  const user = await get('SELECT * FROM users WHERE lower(email) = ?', [email]);
  if (!user) return sendError(res, 'Email not found', 'not_found', 404);
  const token = crypto.randomBytes(20).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + RESET_EXPIRY_MINUTES * 60 * 1000);
  await run('DELETE FROM password_resets WHERE userId = ?', [user.id]);
  await run(
    `INSERT INTO password_resets (tokenHash, userId, expiresAt, createdAt) VALUES (?, ?, ?, ?)`,
    [tokenHash, user.id, expires.toISOString(), now.toISOString()]
  );
  const info = await sendResetEmail(user.email, token);
  const payload = { message: 'Password reset email sent' };
  if (process.env.NODE_ENV === 'test' || !process.env.SMTP_USER) {
    payload.token = token;
    payload.link = info?.link;
  }
  return sendSuccess(res, payload);
});

router.post('/reset', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return sendError(res, 'token and password are required');
  if (!validatePassword(password)) return sendError(res, 'Invalid password: must be 8+ characters with letters and numbers');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const record = await get('SELECT * FROM password_resets WHERE tokenHash = ?', [tokenHash]);
  if (!record) return sendError(res, 'Invalid or expired token', 'unauthorized', 401);
  if (record.usedAt) return sendError(res, 'Token already used', 'unauthorized', 401);
  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    await run('DELETE FROM password_resets WHERE tokenHash = ?', [tokenHash]);
    return sendError(res, 'Invalid or expired token', 'unauthorized', 401);
  }
  const user = await get('SELECT * FROM users WHERE id = ?', [record.userId]);
  if (!user) return sendError(res, 'User not found', 'not_found', 404);
  const passwordHash = await bcrypt.hash(password, 10);
  await run('UPDATE users SET passwordHash = ? WHERE id = ?', [passwordHash, user.id]);
  await run('UPDATE password_resets SET usedAt = ? WHERE tokenHash = ?', [new Date().toISOString(), tokenHash]);
  await run('DELETE FROM sessions WHERE userId = ?', [user.id]);
  return sendSuccess(res, { message: 'Password updated. Please sign in.' });
});

function sanitizeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

module.exports = router;