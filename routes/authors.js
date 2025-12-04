const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, requireRole, sendSuccess, sendError } = require('../utils');

const router = express.Router();

router.get('/', authMiddleware, async (_req, res) => {
  const authors = await all('SELECT * FROM authors ORDER BY name');
  return sendSuccess(res, authors);
});

router.post('/', authMiddleware, requireRole('Admin'), async (req, res) => {
  const { name, bio } = req.body || {};
  if (!name) return sendError(res, 'name is required');
  try {
    const result = await run('INSERT INTO authors (name, bio) VALUES (?, ?)', [name, bio || null]);
    const author = await get('SELECT * FROM authors WHERE id = ?', [result.id]);
    return sendSuccess(res, author, 201);
  } catch (err) {
    console.error(err);
    return sendError(res, 'Failed to create author');
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const author = await get('SELECT * FROM authors WHERE id = ?', [id]);
  if (!author) return sendError(res, 'Author not found', 'not_found', 404);
  return sendSuccess(res, author);
});

router.put('/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  const id = Number(req.params.id);
  const author = await get('SELECT * FROM authors WHERE id = ?', [id]);
  if (!author) return sendError(res, 'Author not found', 'not_found', 404);
  await run('UPDATE authors SET name = ?, bio = ? WHERE id = ?', [
    req.body.name ?? author.name,
    req.body.bio ?? author.bio,
    id
  ]);
  const updated = await get('SELECT * FROM authors WHERE id = ?', [id]);
  return sendSuccess(res, updated);
});

router.delete('/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  const id = Number(req.params.id);
  const author = await get('SELECT * FROM authors WHERE id = ?', [id]);
  if (!author) return sendError(res, 'Author not found', 'not_found', 404);
  await run('DELETE FROM authors WHERE id = ?', [id]);
  return sendSuccess(res, author);
});

module.exports = router;
