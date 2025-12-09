const express = require('express');
const bcrypt = require('bcryptjs');
const { all, get, run } = require('../db');
const {
  authMiddleware,
  requireRole,
  sendSuccess,
  sendError,
  normalizeEmail,
  normalizeText,
  normalizePhone,
  isValidPhone
} = require('../utils');
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

const router = express.Router();

router.get('/', authMiddleware, requireRole('Admin'), async (_req, res) => {
  const members = await all(
    `SELECT m.*, u.username, u.email, u.fullName, u.phone
     FROM members m
     JOIN users u ON u.id = m.userId
     ORDER BY u.username`
  );
  return sendSuccess(res, members);
});

router.get('/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  const id = Number(req.params.id);
  const member = await get(
    `SELECT m.*, u.username, u.email, u.fullName, u.phone
     FROM members m JOIN users u ON u.id = m.userId WHERE m.memberId = ?`,
    [id]
  );
  if (!member) return sendError(res, 'Member not found', 'not_found', 404);
  const loans = await all('SELECT * FROM loans WHERE memberId = ?', [id]);
  const reservations = await all('SELECT * FROM reservations WHERE memberId = ?', [id]);
  const fines = await all('SELECT * FROM fines WHERE memberId = ?', [id]);
  return sendSuccess(res, { member, loans, reservations, fines });
});

// Member loans (filter by status)
router.get('/:id/loans', authMiddleware, requireRole('Admin'), async (req, res) => {
  const id = Number(req.params.id);
  const status = req.query.status || 'active';
  const member = await get('SELECT * FROM members WHERE memberId = ?', [id]);
  if (!member) return sendError(res, 'Member not found', 'not_found', 404);
  let where = 'l.memberId = ?';
  const params = [id];
  if (status === 'active') where += ' AND l.returnDate IS NULL';
  else if (status === 'returned') where += ' AND l.returnDate IS NOT NULL';
  const loans = await all(
    `SELECT l.*, b.title, b.author FROM loans l
     LEFT JOIN books b ON b.isbn = l.isbn
     WHERE ${where}
     ORDER BY datetime(l.borrowDate) DESC`,
    params
  );
  return sendSuccess(res, loans);
});

// Member fines (for admin)
router.get('/:id/fines', authMiddleware, requireRole('Admin'), async (req, res) => {
  const id = Number(req.params.id);
  const status = req.query.status || 'all';
  const member = await get('SELECT * FROM members WHERE memberId = ?', [id]);
  if (!member) return sendError(res, 'Member not found', 'not_found', 404);
  let where = 'f.memberId = ?';
  if (status === 'open') where += " AND f.paymentStatus = 'open' AND f.remainingAmount > 0";
  const fines = await all(
    `SELECT f.*, b.title FROM fines f
     LEFT JOIN loans l ON l.loanId = f.loanId
     LEFT JOIN books b ON b.isbn = l.isbn
     WHERE ${where}
     ORDER BY datetime(f.fineDate) DESC`,
    [id]
  );
  return sendSuccess(res, fines);
});

router.post('/', authMiddleware, requireRole('Admin'), async (req, res) => {
  const { username, email, password, name, address, phone } = req.body || {};
  if (!username || !email || !password || !name) return sendError(res, 'username, email, password, and name are required');
  if (!PASSWORD_RULE.test(password || '')) return sendError(res, 'Invalid password: must be 8+ characters with letters and numbers');
  const normalizedEmail = normalizeEmail(email);
  const normalizedUsername = normalizeText(username).toLowerCase();
  const normalizedFullName = normalizeText(name).toLowerCase();
  const normalizedPhone = normalizePhone(phone || null) || null;
  if (normalizedPhone && !isValidPhone(normalizedPhone)) return sendError(res, 'Invalid phone number');
  const exists = await get(
    `SELECT id, username, email, phone, fullName FROM users WHERE lower(username) = ? OR lower(email) = ? OR phone = ? OR lower(fullName) = ?`,
    [normalizedUsername, normalizedEmail, normalizedPhone, normalizedFullName]
  );
  if (exists) {
    if (exists.email && normalizeEmail(exists.email) === normalizedEmail) return sendError(res, 'Email is already registered', 'conflict', 409);
    if (exists.phone && exists.phone === normalizedPhone) return sendError(res, 'Phone number is already registered', 'conflict', 409);
    if (exists.fullName && normalizeText(exists.fullName).toLowerCase() === normalizedFullName) return sendError(res, 'Full name is already registered', 'conflict', 409);
    return sendError(res, 'Username is already taken', 'conflict', 409);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userRes = await run(
    `INSERT INTO users (username, email, passwordHash, role, fullName, phone) VALUES (?, ?, ?, 'Member', ?, ?)`,
    [normalizedUsername, normalizedEmail, passwordHash, normalizeText(name), normalizedPhone]
  );
  const memberRes = await run(
    `INSERT INTO members (userId, name, address) VALUES (?, ?, ?)`,
    [userRes.id, normalizeText(name), address ? normalizeText(address) : null]
  );
  const created = await get(
    `SELECT m.*, u.username, u.email, u.fullName, u.phone
     FROM members m JOIN users u ON u.id = m.userId WHERE m.memberId = ?`,
    [memberRes.id]
  );
  return sendSuccess(res, created, 201);
});

router.put('/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  const id = Number(req.params.id);
  const member = await get('SELECT * FROM members WHERE memberId = ?', [id]);
  if (!member) return sendError(res, 'Member not found', 'not_found', 404);
  const user = await get('SELECT * FROM users WHERE id = ?', [member.userId]);

  // prevent duplicates when updating email/phone/name
  const nextEmail = req.body.email !== undefined ? normalizeEmail(req.body.email) : normalizeEmail(user.email);
  const nextPhone = req.body.phone !== undefined ? normalizePhone(req.body.phone) : normalizePhone(user.phone);
  const nextName = req.body.name !== undefined ? normalizeText(req.body.name) : normalizeText(user.fullName);
  const nextUsername = req.body.username !== undefined ? normalizeText(req.body.username).toLowerCase() : user.username;
  if (nextPhone && !isValidPhone(nextPhone)) return sendError(res, 'Invalid phone number');
  const conflict = await get(
    `SELECT id, email, phone, fullName, username FROM users WHERE id != ? AND (lower(email) = ? OR phone = ? OR lower(fullName) = ? OR lower(username) = ?)`,
    [user.id, normalizeEmail(nextEmail), nextPhone, normalizeText(nextName).toLowerCase(), nextUsername.toLowerCase()]
  );
  if (conflict) {
    if (conflict.email && normalizeEmail(conflict.email) === normalizeEmail(nextEmail)) return sendError(res, 'Email is already registered', 'conflict', 409);
    if (conflict.phone && conflict.phone === nextPhone) return sendError(res, 'Phone number is already registered', 'conflict', 409);
    if (conflict.fullName && normalizeText(conflict.fullName).toLowerCase() === normalizeText(nextName).toLowerCase()) return sendError(res, 'Full name is already registered', 'conflict', 409);
    if (conflict.username && normalizeText(conflict.username).toLowerCase() === nextUsername.toLowerCase()) return sendError(res, 'Username is already taken', 'conflict', 409);
  }

  await run('UPDATE members SET name = ?, address = ? WHERE memberId = ?', [
    req.body.name ? normalizeText(req.body.name) : member.name,
    req.body.address ? normalizeText(req.body.address) : member.address,
    id
  ]);

  await run('UPDATE users SET fullName = ?, phone = ?, email = ?, username = ? WHERE id = ?', [
    nextName,
    nextPhone,
    nextEmail,
    nextUsername,
    user.id
  ]);

  const updated = await get(
    `SELECT m.*, u.username, u.email, u.fullName, u.phone
     FROM members m JOIN users u ON u.id = m.userId WHERE m.memberId = ?`,
    [id]
  );
  return sendSuccess(res, updated);
});

router.delete('/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  const id = Number(req.params.id);
  const member = await get('SELECT * FROM members WHERE memberId = ?', [id]);
  if (!member) return sendError(res, 'Member not found', 'not_found', 404);
  try {
    await run('BEGIN TRANSACTION');

    const loans = await all('SELECT loanId, isbn, returnDate FROM loans WHERE memberId = ?', [id]);
    for (const loan of loans) {
      if (!loan.returnDate) {
        await run('UPDATE books SET copiesAvailable = copiesAvailable + 1 WHERE isbn = ?', [loan.isbn]);
      }
    }

    await run('DELETE FROM payments WHERE memberId = ?', [id]);
    await run('DELETE FROM fines WHERE memberId = ?', [id]);
    await run('DELETE FROM reservations WHERE memberId = ?', [id]);
    await run('DELETE FROM loans WHERE memberId = ?', [id]);
    await run('DELETE FROM members WHERE memberId = ?', [id]);
    await run('DELETE FROM users WHERE id = ?', [member.userId]);

    await run('COMMIT');
  } catch (err) {
    await run('ROLLBACK').catch(() => {});
    console.error('Failed to delete member', err);
    return sendError(res, 'Unable to delete member. Clear related records and try again.', 'server_error', 500);
  }
  return sendSuccess(res, member);
});

module.exports = router;
