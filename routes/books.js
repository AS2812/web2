const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, requireRole, sendSuccess, sendError } = require('../utils');

const router = express.Router();

const normalizeIsbn = (isbn) => String(isbn || '').replace(/[^0-9]/g, '');

async function enrichBooks(rows) {
  const links = await all(
    `SELECT w.isbn, a.id as authorId, a.name FROM wrote w JOIN authors a ON a.id = w.authorId`
  );
  const byIsbn = links.reduce((acc, row) => {
    const key = normalizeIsbn(row.isbn) || row.isbn;
    acc[key] = acc[key] || [];
    acc[key].push({ id: row.authorId, name: row.name });
    return acc;
  }, {});
  return rows.map((b) => {
    const isbn = normalizeIsbn(b.isbn) || b.isbn;
    const cover = b.cover && /^https?:\/\//i.test(b.cover) ? b.cover.replace(/^http:/i, 'https:') : null;
    return {
      ...b,
      isbn,
      cover,
      publisher: b.publisherId ? { id: b.publisherId, name: b.publisherName } : null,
      authors: byIsbn[isbn] || []
    };
  });
}

router.get('/', authMiddleware, async (_req, res) => {
  const rows = await all(
    `SELECT b.*, p.name as publisherName
     FROM books b
     LEFT JOIN publishers p ON p.id = b.publisherId
     ORDER BY b.title`
  );
  const books = await enrichBooks(rows);
  return sendSuccess(res, books);
});

router.get('/:isbn', authMiddleware, async (req, res) => {
  const isbn = normalizeIsbn(req.params.isbn);
  const row = await get(
    `SELECT b.*, p.name as publisherName FROM books b LEFT JOIN publishers p ON p.id = b.publisherId WHERE b.isbn = ?`,
    [isbn]
  );
  if (!row) return sendError(res, 'Book not found', 'not_found', 404);
  const [book] = await enrichBooks([row]);
  return sendSuccess(res, book);
});

router.post('/', authMiddleware, requireRole('Admin'), async (req, res) => {
  const { isbn, title, category, publicationDate, copiesAvailable, totalCopies, publisherId, authors, description, cover } =
    req.body || {};
  if (!isbn || !title) return sendError(res, 'isbn and title are required');
  const normalizedIsbn = normalizeIsbn(isbn);
  if (normalizedIsbn.length !== 13) return sendError(res, 'ISBN must be a 13-digit number string');
  const exists = await get('SELECT isbn FROM books WHERE isbn = ?', [normalizedIsbn]);
  if (exists) return sendError(res, 'Book already exists', 'conflict', 409);
  try {
    const coverUrl =
      typeof cover === 'string' && /^https?:\/\//i.test(cover) ? cover.replace(/^http:/i, 'https:') : null;
    await run(
      `INSERT INTO books (isbn, title, category, publicationDate, copiesAvailable, totalCopies, publisherId, description, cover)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedIsbn,
        title,
        category || null,
        publicationDate || null,
        copiesAvailable ?? totalCopies ?? 1,
        totalCopies ?? copiesAvailable ?? 1,
        publisherId || null,
        description || null,
        coverUrl
      ]
    );

    if (Array.isArray(authors)) {
      for (const authorId of authors) {
        await run('INSERT INTO wrote (isbn, authorId) VALUES (?, ?)', [normalizedIsbn, authorId]);
      }
    }

    const book = await get(
      `SELECT b.*, p.name as publisherName FROM books b LEFT JOIN publishers p ON p.id = b.publisherId WHERE b.isbn = ?`,
      [normalizedIsbn]
    );
    const [detailed] = await enrichBooks([book]);
    return sendSuccess(res, detailed, 201);
  } catch (err) {
    console.error(err);
    return sendError(res, 'Failed to create book');
  }
});

router.put('/:isbn', authMiddleware, requireRole('Admin'), async (req, res) => {
  const isbn = normalizeIsbn(req.params.isbn);
  const book = await get('SELECT * FROM books WHERE isbn = ?', [isbn]);
  if (!book) return sendError(res, 'Book not found', 'not_found', 404);
  const nextCopies = req.body.copiesAvailable ?? book.copiesAvailable;
  const nextTotal = req.body.totalCopies ?? book.totalCopies;
  const coverUrl =
    typeof req.body.cover === 'string' && /^https?:\/\//i.test(req.body.cover)
      ? req.body.cover.replace(/^http:/i, 'https:')
      : req.body.cover === null
      ? null
      : book.cover;
  await run(
    `UPDATE books SET
      title = ?, category = ?, publicationDate = ?, copiesAvailable = ?, totalCopies = ?, publisherId = ?, description = ?, cover = ?
     WHERE isbn = ?`,
    [
      req.body.title ?? book.title,
      req.body.category ?? book.category,
      req.body.publicationDate ?? book.publicationDate,
      nextCopies,
      nextTotal,
      req.body.publisherId ?? book.publisherId,
      req.body.description ?? book.description,
      coverUrl,
      isbn
    ]
  );

  if (Array.isArray(req.body.authors)) {
    await run('DELETE FROM wrote WHERE isbn = ?', [isbn]);
    for (const authorId of req.body.authors) {
      await run('INSERT INTO wrote (isbn, authorId) VALUES (?, ?)', [isbn, authorId]);
    }
  }

  const updated = await get(
    `SELECT b.*, p.name as publisherName FROM books b LEFT JOIN publishers p ON p.id = b.publisherId WHERE b.isbn = ?`,
    [isbn]
  );
  const [detailed] = await enrichBooks([updated]);
  return sendSuccess(res, detailed);
});

router.delete('/:isbn', authMiddleware, requireRole('Admin'), async (req, res) => {
  const isbn = normalizeIsbn(req.params.isbn);
  const book = await get('SELECT * FROM books WHERE isbn = ?', [isbn]);
  if (!book) return sendError(res, 'Book not found', 'not_found', 404);
  // Clean dependent rows to satisfy FK constraints.
  const loans = await all('SELECT loanId FROM loans WHERE isbn = ?', [isbn]);
  for (const loan of loans) {
    await run('DELETE FROM fines WHERE loanId = ?', [loan.loanId]);
  }
  await run('DELETE FROM reservations WHERE isbn = ?', [isbn]);
  await run('DELETE FROM loans WHERE isbn = ?', [isbn]);
  await run('DELETE FROM wrote WHERE isbn = ?', [isbn]);
  await run('DELETE FROM books WHERE isbn = ?', [isbn]);
  return sendSuccess(res, book);
});

module.exports = router;
