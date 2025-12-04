const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, requireRole, sendSuccess, sendError } = require('../utils');

const router = express.Router();

async function memberForUser(userId) {
  return get('SELECT * FROM members WHERE userId = ?', [userId]);
}

router.get('/', authMiddleware, requireRole('Admin'), async (_req, res) => {
  const rows = await all(
    `SELECT l.*, b.title, b.category, m.name as memberName
     FROM loans l
     JOIN books b ON b.isbn = l.isbn
     JOIN members m ON m.memberId = l.memberId
     ORDER BY datetime(l.borrowDate) DESC`
  );
  return sendSuccess(res, rows);
});

router.get('/me', authMiddleware, requireRole('Member'), async (req, res) => {
  const member = await memberForUser(req.user.id);
  if (!member) return sendError(res, 'Member profile not found', 'not_found', 404);
  const loans = await all(
    `SELECT * FROM loans WHERE memberId = ? ORDER BY datetime(borrowDate) DESC`,
    [member.memberId]
  );
  return sendSuccess(res, loans);
});

router.post('/borrow', authMiddleware, async (req, res) => {
  const { isbn, memberId: memberIdBody } = req.body || {};
  if (!isbn) return sendError(res, 'isbn is required');
  const book = await get('SELECT * FROM books WHERE isbn = ?', [isbn]);
  if (!book) return sendError(res, 'Book not found', 'not_found', 404);
  if (book.copiesAvailable <= 0) return sendError(res, 'No copies available', 'conflict', 409);

  let member = null;
  if (req.user.role === 'Admin') {
    if (!memberIdBody) return sendError(res, 'memberId is required for admin issuing');
    member = await get('SELECT * FROM members WHERE memberId = ?', [memberIdBody]);
    if (!member) return sendError(res, 'Member not found', 'not_found', 404);
  } else {
    member = await memberForUser(req.user.id);
    if (!member) return sendError(res, 'Member profile not found', 'not_found', 404);
  }

  await run('UPDATE books SET copiesAvailable = copiesAvailable - 1 WHERE isbn = ?', [isbn]);
  const borrowDate = new Date();
  const dueDate = new Date(borrowDate.getTime() + 14 * 24 * 60 * 60 * 1000);
  const result = await run(
    `INSERT INTO loans (isbn, memberId, borrowDate, dueDate, returnDate) VALUES (?, ?, ?, ?, NULL)`,
    [isbn, member.memberId, borrowDate.toISOString(), dueDate.toISOString()]
  );

  await run(
    `UPDATE reservations SET status = 'Fulfilled' WHERE memberId = ? AND isbn = ? AND status IN ('Pending','Ready')`,
    [member.memberId, isbn]
  );

  const loan = await get('SELECT * FROM loans WHERE loanId = ?', [result.id]);
  return sendSuccess(res, loan, 201);
});

router.post('/return', authMiddleware, async (req, res) => {
  const { loanId } = req.body || {};
  if (!loanId) return sendError(res, 'loanId is required');
  const loan = await get('SELECT * FROM loans WHERE loanId = ?', [loanId]);
  if (!loan) return sendError(res, 'Loan not found', 'not_found', 404);
  if (loan.returnDate) return sendError(res, 'Loan already returned', 'conflict', 409);

  const member = await memberForUser(req.user.id);
  if (req.user.role !== 'Admin') {
    if (!member || loan.memberId !== member.memberId) {
      return sendError(res, 'Cannot return other member loans', 'forbidden', 403);
    }
  }

  const returnDate = new Date();
  await run('UPDATE loans SET returnDate = ? WHERE loanId = ?', [returnDate.toISOString(), loanId]);
  await run('UPDATE books SET copiesAvailable = copiesAvailable + 1 WHERE isbn = ?', [loan.isbn]);

  const due = new Date(loan.dueDate);
  const daysLate = Math.max(0, Math.ceil((returnDate - due) / (1000 * 60 * 60 * 24)));
  let fine;
  if (daysLate > 0) {
    const existingFine = await get('SELECT * FROM fines WHERE loanId = ?', [loanId]);
    if (!existingFine) {
      const fineResult = await run(
        `INSERT INTO fines (loanId, memberId, fineAmount, fineDate, paymentStatus) VALUES (?, ?, ?, ?, 'Pending')`,
        [loanId, loan.memberId, daysLate * 1, returnDate.toISOString()]
      );
      fine = await get('SELECT * FROM fines WHERE fineId = ?', [fineResult.id]);
    } else {
      fine = existingFine;
    }
  }

  const updatedLoan = await get('SELECT * FROM loans WHERE loanId = ?', [loanId]);
  return sendSuccess(res, { loan: updatedLoan, fine });
});

router.patch('/:id/extend', authMiddleware, requireRole('Admin'), async (req, res) => {
  const id = Number(req.params.id);
  const days = Number(req.body.days || 7);
  const loan = await get('SELECT * FROM loans WHERE loanId = ?', [id]);
  if (!loan) return sendError(res, 'Loan not found', 'not_found', 404);
  const due = new Date(loan.dueDate);
  due.setDate(due.getDate() + days);
  await run('UPDATE loans SET dueDate = ? WHERE loanId = ?', [due.toISOString(), id]);
  const updated = await get('SELECT * FROM loans WHERE loanId = ?', [id]);
  return sendSuccess(res, updated);
});

module.exports = router;
