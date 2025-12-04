const express = require('express');
const { get, all } = require('../db');
const { authMiddleware, requireRole, sendSuccess, sendError } = require('../utils');

const router = express.Router();

router.get('/admin', authMiddleware, requireRole('Admin'), async (_req, res) => {
  const nowIso = new Date().toISOString();
  const totalBooks = await get('SELECT COUNT(*) as count FROM books');
  const totalMembers = await get('SELECT COUNT(*) as count FROM members');
  const activeLoans = await get('SELECT COUNT(*) as count FROM loans WHERE returnDate IS NULL');
  const overdueLoans = await get(
    'SELECT COUNT(*) as count FROM loans WHERE returnDate IS NULL AND datetime(dueDate) < datetime(?)',
    [nowIso]
  );
  const pendingReservations = await get(
    "SELECT COUNT(*) as count FROM reservations WHERE status IN ('Pending','Ready')"
  );
  const pendingFines = await get(
    "SELECT COUNT(*) as count FROM fines WHERE paymentStatus != 'Paid'"
  );

  const borrowByMonth = await get(
    `SELECT COALESCE(SUM(CASE strftime('%m', borrowDate) WHEN '01' THEN 1 ELSE 0 END),0) AS m1,
            COALESCE(SUM(CASE strftime('%m', borrowDate) WHEN '02' THEN 1 ELSE 0 END),0) AS m2,
            COALESCE(SUM(CASE strftime('%m', borrowDate) WHEN '03' THEN 1 ELSE 0 END),0) AS m3,
            COALESCE(SUM(CASE strftime('%m', borrowDate) WHEN '04' THEN 1 ELSE 0 END),0) AS m4,
            COALESCE(SUM(CASE strftime('%m', borrowDate) WHEN '05' THEN 1 ELSE 0 END),0) AS m5,
            COALESCE(SUM(CASE strftime('%m', borrowDate) WHEN '06' THEN 1 ELSE 0 END),0) AS m6,
            COALESCE(SUM(CASE strftime('%m', borrowDate) WHEN '07' THEN 1 ELSE 0 END),0) AS m7,
            COALESCE(SUM(CASE strftime('%m', borrowDate) WHEN '08' THEN 1 ELSE 0 END),0) AS m8,
            COALESCE(SUM(CASE strftime('%m', borrowDate) WHEN '09' THEN 1 ELSE 0 END),0) AS m9,
            COALESCE(SUM(CASE strftime('%m', borrowDate) WHEN '10' THEN 1 ELSE 0 END),0) AS m10,
            COALESCE(SUM(CASE strftime('%m', borrowDate) WHEN '11' THEN 1 ELSE 0 END),0) AS m11,
            COALESCE(SUM(CASE strftime('%m', borrowDate) WHEN '12' THEN 1 ELSE 0 END),0) AS m12
     FROM loans`
  );

  const categories = await get(
    `SELECT group_concat(category) as categories FROM books`
  );
  const rows = await get(
    `SELECT COUNT(*) as total FROM books`
  );
  const catCounts = await all(`SELECT category as label, COUNT(*) as value FROM books GROUP BY category`);

  return sendSuccess(res, {
    totalBooks: totalBooks.count,
    totalMembers: totalMembers.count,
    activeLoans: activeLoans.count,
    overdueLoans: overdueLoans.count,
    pendingReservations: pendingReservations.count,
    pendingFines: pendingFines.count,
    borrowByMonth,
    categoryDistribution: catCounts
  });
});

router.get('/member', authMiddleware, async (req, res) => {
  // Member dashboard counts
  const member = await get('SELECT * FROM members WHERE userId = ?', [req.user.id]);
  if (!member) return sendError(res, 'Member profile not found', 'not_found', 404);
  const borrowed = await get(
    'SELECT COUNT(*) as count FROM loans WHERE memberId = ? AND returnDate IS NULL',
    [member.memberId]
  );
  const reservations = await get(
    "SELECT COUNT(*) as count FROM reservations WHERE memberId = ? AND status IN ('Pending','Ready')",
    [member.memberId]
  );
  const fines = await get(
    "SELECT COALESCE(SUM(fineAmount),0) as total FROM fines WHERE memberId = ? AND paymentStatus != 'Paid'",
    [member.memberId]
  );
  const catCounts = await all(
    `SELECT b.category as label, COUNT(*) as value
     FROM loans l
     JOIN books b ON b.isbn = l.isbn
     WHERE l.memberId = ?
     GROUP BY b.category`,
    [member.memberId]
  );
  return sendSuccess(res, {
    borrowed: borrowed.count,
    reservations: reservations.count,
    finesDue: fines.total,
    categoryDistribution: catCounts
  });
});

module.exports = router;
