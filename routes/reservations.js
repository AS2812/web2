const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, requireRole, sendSuccess, sendError } = require('../utils');

const router = express.Router();

async function memberForUser(userId) {
  return get('SELECT * FROM members WHERE userId = ?', [userId]);
}

router.get('/', authMiddleware, requireRole('Admin'), async (_req, res) => {
  const list = await all(
    `SELECT r.*, b.title, m.name as memberName
     FROM reservations r
     JOIN books b ON b.isbn = r.isbn
     JOIN members m ON m.memberId = r.memberId
     ORDER BY datetime(r.reservationDate) DESC`
  );
  return sendSuccess(res, list);
});

router.post('/', authMiddleware, requireRole('Member'), async (req, res) => {
  const { isbn } = req.body || {};
  if (!isbn) return sendError(res, 'isbn is required');
  const book = await get('SELECT * FROM books WHERE isbn = ?', [isbn]);
  if (!book) return sendError(res, 'Book not found', 'not_found', 404);
  const member = await memberForUser(req.user.id);
  if (!member) return sendError(res, 'Member profile not found', 'not_found', 404);

  const active = await get(
    `SELECT reservationId FROM reservations WHERE memberId = ? AND isbn = ? AND status IN ('Pending','Ready')`,
    [member.memberId, isbn]
  );
  if (active) return sendError(res, 'Active reservation exists', 'conflict', 409);

  const now = new Date().toISOString();
  const result = await run(
    `INSERT INTO reservations (isbn, memberId, reservationDate, status) VALUES (?, ?, ?, 'Pending')`,
    [isbn, member.memberId, now]
  );
  const reservation = await get('SELECT * FROM reservations WHERE reservationId = ?', [result.id]);
  return sendSuccess(res, reservation, 201);
});

router.patch('/:id/cancel', authMiddleware, requireRole('Member'), async (req, res) => {
  const id = Number(req.params.id);
  const reservation = await get('SELECT * FROM reservations WHERE reservationId = ?', [id]);
  if (!reservation) return sendError(res, 'Reservation not found', 'not_found', 404);
  const member = await memberForUser(req.user.id);
  if (!member || reservation.memberId !== member.memberId) {
    return sendError(res, 'Cannot cancel other reservations', 'forbidden', 403);
  }
  await run(`UPDATE reservations SET status = 'Cancelled' WHERE reservationId = ?`, [id]);
  const updated = await get('SELECT * FROM reservations WHERE reservationId = ?', [id]);
  return sendSuccess(res, updated);
});

router.get('/me', authMiddleware, requireRole('Member'), async (req, res) => {
  const member = await memberForUser(req.user.id);
  if (!member) return sendError(res, 'Member profile not found', 'not_found', 404);
  const list = await all(
    `SELECT * FROM reservations WHERE memberId = ? ORDER BY datetime(reservationDate) DESC`,
    [member.memberId]
  );
  return sendSuccess(res, list);
});

router.patch('/:id/status', authMiddleware, requireRole('Admin'), async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  const allowed = ['Pending', 'Ready', 'Fulfilled', 'Cancelled'];
  if (!allowed.includes(status)) return sendError(res, 'Invalid status');
  const reservation = await get('SELECT * FROM reservations WHERE reservationId = ?', [id]);
  if (!reservation) return sendError(res, 'Reservation not found', 'not_found', 404);

  if (status === 'Fulfilled') {
    const book = await get('SELECT * FROM books WHERE isbn = ?', [reservation.isbn]);
    if (!book) return sendError(res, 'Book not found', 'not_found', 404);
    if (book.copiesAvailable <= 0) return sendError(res, 'No copies available to fulfill', 'conflict', 409);
    await run('UPDATE books SET copiesAvailable = copiesAvailable - 1 WHERE isbn = ?', [reservation.isbn]);
    const now = new Date();
    const due = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    await run(
      `INSERT INTO loans (isbn, memberId, borrowDate, dueDate, returnDate) VALUES (?, ?, ?, ?, NULL)`,
      [reservation.isbn, reservation.memberId, now.toISOString(), due.toISOString()]
    );
  }

  await run('UPDATE reservations SET status = ? WHERE reservationId = ?', [status, id]);
  const updated = await get('SELECT * FROM reservations WHERE reservationId = ?', [id]);
  return sendSuccess(res, updated);
});

module.exports = router;
