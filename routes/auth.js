const express = require('express');
const bcrypt = require('bcryptjs');
const { get, run } = require('../db');
const { signToken, sendSuccess, sendError, authMiddleware } = require('../utils');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { username, email, password, name, address, phone } = req.body || {};
  if (!username || !password || !name) {
    return sendError(res, 'username, password, and name are required');
  }
  const normalizedEmail = email || `${username}@example.com`;
  try {
    const exists = await get('SELECT id FROM users WHERE username = ? OR email = ?', [username, normalizedEmail]);
    if (exists) return sendError(res, 'User already exists', 'conflict', 409);

    const passwordHash = await bcrypt.hash(password, 10);
    const userRes = await run(
      `INSERT INTO users (username, email, passwordHash, role, fullName, phone) VALUES (?, ?, ?, 'Member', ?, ?)`,
      [username, normalizedEmail, passwordHash, name, phone || null]
    );
    await run(`INSERT INTO members (userId, name, address) VALUES (?, ?, ?)`, [
      userRes.id,
      name,
      address || null
    ]);
    const token = signToken({ id: userRes.id, role: 'Member' });
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
  const { username, password } = req.body || {};
  if (!username || !password) return sendError(res, 'username and password are required');
  try {
    const user = await get('SELECT * FROM users WHERE username = ? OR email = ?', [username, username]);
    if (!user) return sendError(res, 'Invalid credentials', 'unauthorized', 401);
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return sendError(res, 'Invalid credentials', 'unauthorized', 401);
    const token = signToken({ id: user.id, role: user.role });
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
  // Stateless JWT: client drops token.
  return sendSuccess(res, { message: 'Logged out' });
});

function sanitizeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

module.exports = router;
