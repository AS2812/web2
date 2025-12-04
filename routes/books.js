const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, requireRole, sendSuccess, sendError } = require('../utils');

const router = express.Router();

async function enrichBooks(rows) {
  const links = await all(
    `SELECT w.isbn, a.id as authorId, a.name FROM wrote w JOIN authors a ON a.id = w.authorId`
  );
  const byIsbn = links.reduce((acc, row) => {
    acc[row.isbn] = acc[row.isbn] || [];
    acc[row.isbn].push({ id: row.authorId, name: row.name });
    return acc;
  }, {});
  return rows.map((b) => ({
    ...b,
    publisher: b.publisherId ? { id: b.publisherId, name: b.publisherName } : null,
    authors: byIsbn[b.isbn] || []
  }));
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
  const row = await get(
    `SELECT b.*, p.name as publisherName FROM books b LEFT JOIN publishers p ON p.id = b.publisherId WHERE b.isbn = ?`,
    [req.params.isbn]
  );
  if (!row) return sendError(res, 'Book not found', 'not_found', 404);
  const [book] = await enrichBooks([row]);
  return sendSuccess(res, book);
});

router.post('/', authMiddleware, requireRole('Admin'), async (req, res) => {
  const { isbn, title, category, publicationDate, copiesAvailable, totalCopies, publisherId, authors, description, cover } =
    req.body || {};
  if (!isbn || !title) return sendError(res, 'isbn and title are required');
  const exists = await get('SELECT isbn FROM books WHERE isbn = ?', [isbn]);
  if (exists) return sendError(res, 'Book already exists', 'conflict', 409);
  try {
    await run(
      `INSERT INTO books (isbn, title, category, publicationDate, copiesAvailable, totalCopies, publisherId, description, cover)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        isbn,
        title,
        category || null,
        publicationDate || null,
        copiesAvailable ?? totalCopies ?? 1,
        totalCopies ?? copiesAvailable ?? 1,
        publisherId || null,
        description || null,
        cover || `https://picsum.photos/seed/${encodeURIComponent(isbn)}/240/320`
      ]
    );

    if (Array.isArray(authors)) {
      for (const authorId of authors) {
        await run('INSERT INTO wrote (isbn, authorId) VALUES (?, ?)', [isbn, authorId]);
      }
    }

    const book = await get(
      `SELECT b.*, p.name as publisherName FROM books b LEFT JOIN publishers p ON p.id = b.publisherId WHERE b.isbn = ?`,
      [isbn]
    );
    const [detailed] = await enrichBooks([book]);
    return sendSuccess(res, detailed, 201);
  } catch (err) {
    console.error(err);
    return sendError(res, 'Failed to create book');
  }
});

router.put('/:isbn', authMiddleware, requireRole('Admin'), async (req, res) => {
  const book = await get('SELECT * FROM books WHERE isbn = ?', [req.params.isbn]);
  if (!book) return sendError(res, 'Book not found', 'not_found', 404);
  const nextCopies = req.body.copiesAvailable ?? book.copiesAvailable;
  const nextTotal = req.body.totalCopies ?? book.totalCopies;
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
      req.body.cover ?? book.cover,
      req.params.isbn
    ]
  );

  if (Array.isArray(req.body.authors)) {
    await run('DELETE FROM wrote WHERE isbn = ?', [req.params.isbn]);
    for (const authorId of req.body.authors) {
      await run('INSERT INTO wrote (isbn, authorId) VALUES (?, ?)', [req.params.isbn, authorId]);
    }
  }

  const updated = await get(
    `SELECT b.*, p.name as publisherName FROM books b LEFT JOIN publishers p ON p.id = b.publisherId WHERE b.isbn = ?`,
    [req.params.isbn]
  );
  const [detailed] = await enrichBooks([updated]);
  return sendSuccess(res, detailed);
});

router.delete('/:isbn', authMiddleware, requireRole('Admin'), async (req, res) => {
  const book = await get('SELECT * FROM books WHERE isbn = ?', [req.params.isbn]);
  if (!book) return sendError(res, 'Book not found', 'not_found', 404);
  await run('DELETE FROM books WHERE isbn = ?', [req.params.isbn]);
  return sendSuccess(res, book);
});

module.exports = router;
