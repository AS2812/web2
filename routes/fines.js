const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, requireRole, sendSuccess, sendError } = require('../utils');

const router = express.Router();

async function memberForUser(userId) {
  return get('SELECT * FROM members WHERE userId = ?', [userId]);
}

router.get('/', authMiddleware, requireRole('Admin'), async (_req, res) => {
  const fines = await all(
    `SELECT f.*, u.username, b.title
     FROM fines f
     JOIN members m ON m.memberId = f.memberId
     JOIN users u ON u.id = m.userId
     LEFT JOIN loans l ON l.loanId = f.loanId
     LEFT JOIN books b ON b.isbn = l.isbn
     ORDER BY datetime(f.fineDate) DESC`
  );
  return sendSuccess(res, fines);
});

router.get('/me', authMiddleware, requireRole('Member'), async (req, res) => {
  const member = await memberForUser(req.user.id);
  if (!member) return sendError(res, 'Member profile not found', 'not_found', 404);
  const fines = await all(
    `SELECT f.*, l.dueDate, l.returnDate, b.title
     FROM fines f
     LEFT JOIN loans l ON l.loanId = f.loanId
     LEFT JOIN books b ON b.isbn = l.isbn
     WHERE f.memberId = ?
     ORDER BY datetime(f.fineDate) DESC`,
    [member.memberId]
  );
  return sendSuccess(res, fines);
});

router.patch('/:id/pay', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const fine = await get('SELECT * FROM fines WHERE fineId = ?', [id]);
  if (!fine) return sendError(res, 'Fine not found', 'not_found', 404);
  const member = await memberForUser(req.user.id);
  if (req.user.role !== 'Admin') {
    if (!member || fine.memberId !== member.memberId) {
      return sendError(res, 'Cannot pay other member fines', 'forbidden', 403);
    }
  }
  await run(`UPDATE fines SET paymentStatus = 'Paid' WHERE fineId = ?`, [id]);
  const updated = await get('SELECT * FROM fines WHERE fineId = ?', [id]);
  return sendSuccess(res, updated);
});

router.patch('/:id/status', authMiddleware, requireRole('Admin'), async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  const allowed = ['Pending', 'Paid', 'Waived'];
  if (!allowed.includes(status)) return sendError(res, 'Invalid status');
  const fine = await get('SELECT * FROM fines WHERE fineId = ?', [id]);
  if (!fine) return sendError(res, 'Fine not found', 'not_found', 404);
  await run('UPDATE fines SET paymentStatus = ? WHERE fineId = ?', [status, id]);
  const updated = await get('SELECT * FROM fines WHERE fineId = ?', [id]);
  return sendSuccess(res, updated);
});

router.put('/:id/reduce', authMiddleware, requireRole('Admin'), async (req, res) => {
  const id = Number(req.params.id);
  const amount = Number(req.body.amount || 0);
  const fine = await get('SELECT * FROM fines WHERE fineId = ?', [id]);
  if (!fine) return sendError(res, 'Fine not found', 'not_found', 404);
  const next = Math.max(0, Number(fine.fineAmount || 0) - amount);
  await run('UPDATE fines SET fineAmount = ?, paymentStatus = ? WHERE fineId = ?', [
    next,
    next === 0 ? 'Waived' : fine.paymentStatus,
    id
  ]);
  const updated = await get('SELECT * FROM fines WHERE fineId = ?', [id]);
  return sendSuccess(res, updated);
});

module.exports = router;
