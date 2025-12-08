const express = require('express');
const bcrypt = require('bcryptjs');
const { all, get, run } = require('../db');
const { authMiddleware, requireRole, sendSuccess, sendError } = require('../utils');

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
  const exists = await get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
  if (exists) return sendError(res, 'User already exists', 'conflict', 409);

  const passwordHash = await bcrypt.hash(password, 10);
  const userRes = await run(
    `INSERT INTO users (username, email, passwordHash, role, fullName, phone) VALUES (?, ?, ?, 'Member', ?, ?)`,
    [username, email, passwordHash, name, phone || null]
  );
  const memberRes = await run(
    `INSERT INTO members (userId, name, address) VALUES (?, ?, ?)`,
    [userRes.id, name, address || null]
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

  await run('UPDATE members SET name = ?, address = ? WHERE memberId = ?', [
    req.body.name ?? member.name,
    req.body.address ?? member.address,
    id
  ]);

  await run('UPDATE users SET fullName = ?, phone = ?, email = ? WHERE id = ?', [
    req.body.name ?? user.fullName,
    req.body.phone ?? user.phone,
    req.body.email ?? user.email,
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
