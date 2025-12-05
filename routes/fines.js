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
  const amount = req.body?.amount !== undefined ? Number(req.body.amount) : null;
  const fine = await get('SELECT * FROM fines WHERE fineId = ?', [id]);
  if (!fine) return sendError(res, 'Fine not found', 'not_found', 404);
  const member = await memberForUser(req.user.id);
  if (req.user.role !== 'Admin') {
    if (!member || fine.memberId !== member.memberId) {
      return sendError(res, 'Cannot pay other member fines', 'forbidden', 403);
    }
  }
  const currentRemaining = Number(fine.remainingAmount ?? fine.fineAmount ?? 0);
  const payAmount = amount === null ? currentRemaining : Math.max(0, amount);
  const applied = Math.min(currentRemaining, payAmount);
  const nextRemaining = Number((currentRemaining - applied).toFixed(2));
  const nextStatus = nextRemaining <= 0 ? 'Paid' : 'Pending';
  await run(
    `UPDATE fines SET remainingAmount = ?, fineAmount = ?, paymentStatus = ? WHERE fineId = ?`,
    [nextRemaining, nextRemaining, nextStatus, id]
  );
  const updated = await get('SELECT * FROM fines WHERE fineId = ?', [id]);
  return sendSuccess(res, { fine: updated, applied });
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
  const nextStatus = next === 0 ? 'Waived' : fine.paymentStatus;
  await run(
    'UPDATE fines SET fineAmount = ?, remainingAmount = ?, paymentStatus = ? WHERE fineId = ?',
    [next, next, nextStatus, id]
  );
  const updated = await get('SELECT * FROM fines WHERE fineId = ?', [id]);
  return sendSuccess(res, updated);
});

// Admin can add a fine manually
router.post('/', authMiddleware, requireRole('Admin'), async (req, res) => {
  const { memberId, loanId, fineAmount } = req.body || {};
  if (!memberId || fineAmount === undefined || loanId === undefined) {
    return sendError(res, 'memberId, loanId and fineAmount are required');
  }
  const member = await get('SELECT * FROM members WHERE memberId = ?', [memberId]);
  if (!member) return sendError(res, 'Member not found', 'not_found', 404);
  const loan = await get('SELECT * FROM loans WHERE loanId = ?', [loanId]);
  if (!loan) return sendError(res, 'Loan not found', 'not_found', 404);
  const amount = Number(fineAmount);
  const fineDate = new Date().toISOString();
  const result = await run(
    `INSERT INTO fines (loanId, memberId, fineAmount, originalAmount, remainingAmount, fineDate, paymentStatus)
     VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
    [loanId, memberId, amount, amount, amount, fineDate]
  );
  const fine = await get('SELECT * FROM fines WHERE fineId = ?', [result.id]);
  return sendSuccess(res, fine, 201);
});

// Bulk/partial payment allocation across fines (oldest first)
router.post('/pay', authMiddleware, async (req, res) => {
  const rawAmount = Number(req.body?.amount || 0);
  const targetMemberId = req.user.role === 'Admin' ? Number(req.body?.memberId || 0) : null;
  const member = req.user.role === 'Admin'
    ? targetMemberId && (await get('SELECT * FROM members WHERE memberId = ?', [targetMemberId]))
    : await memberForUser(req.user.id);
  if (!member) return sendError(res, 'Member not found', 'not_found', 404);
  const amount = Math.max(0, rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) return sendError(res, 'Amount must be greater than 0');

  const fines = await all(
    `SELECT * FROM fines WHERE memberId = ? AND paymentStatus != 'Paid' ORDER BY datetime(fineDate) ASC, fineId ASC`,
    [member.memberId]
  );
  let payLeft = amount;
  const allocations = [];
  for (const fine of fines) {
    if (payLeft <= 0) break;
    const remaining = Number(fine.remainingAmount ?? fine.fineAmount ?? 0);
    if (remaining <= 0) continue;
    const apply = Math.min(remaining, payLeft);
    const nextRemaining = Number((remaining - apply).toFixed(2));
    const nextStatus = nextRemaining <= 0 ? 'Paid' : 'Pending';
    await run(
      `UPDATE fines SET remainingAmount = ?, fineAmount = ?, paymentStatus = ? WHERE fineId = ?`,
      [nextRemaining, nextRemaining, nextStatus, fine.fineId]
    );
    allocations.push({ fineId: fine.fineId, applied: apply, before: remaining, after: nextRemaining });
    payLeft = Number((payLeft - apply).toFixed(2));
  }
  const updated = await all(
    `SELECT f.*, b.title FROM fines f
     LEFT JOIN loans l ON l.loanId = f.loanId
     LEFT JOIN books b ON b.isbn = l.isbn
     WHERE f.memberId = ? ORDER BY datetime(f.fineDate) DESC`,
    [member.memberId]
  );
  return sendSuccess(res, { fines: updated, allocations, leftover: payLeft });
});

module.exports = router;
