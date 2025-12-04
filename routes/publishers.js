const express = require('express');
const { all, get, run } = require('../db');
const { authMiddleware, requireRole, sendSuccess, sendError } = require('../utils');

const router = express.Router();

router.get('/', authMiddleware, async (_req, res) => {
  const publishers = await all('SELECT * FROM publishers ORDER BY name');
  return sendSuccess(res, publishers);
});

router.post('/', authMiddleware, requireRole('Admin'), async (req, res) => {
  const { name, address } = req.body || {};
  if (!name) return sendError(res, 'name is required');
  try {
    const result = await run('INSERT INTO publishers (name, address) VALUES (?, ?)', [name, address || null]);
    const publisher = await get('SELECT * FROM publishers WHERE id = ?', [result.id]);
    return sendSuccess(res, publisher, 201);
  } catch (err) {
    console.error(err);
    return sendError(res, 'Failed to create publisher');
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  const id = Number(req.params.id);
  const publisher = await get('SELECT * FROM publishers WHERE id = ?', [id]);
  if (!publisher) return sendError(res, 'Publisher not found', 'not_found', 404);
  return sendSuccess(res, publisher);
});

router.put('/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  const id = Number(req.params.id);
  const publisher = await get('SELECT * FROM publishers WHERE id = ?', [id]);
  if (!publisher) return sendError(res, 'Publisher not found', 'not_found', 404);
  await run('UPDATE publishers SET name = ?, address = ? WHERE id = ?', [
    req.body.name ?? publisher.name,
    req.body.address ?? publisher.address,
    id
  ]);
  const updated = await get('SELECT * FROM publishers WHERE id = ?', [id]);
  return sendSuccess(res, updated);
});

router.delete('/:id', authMiddleware, requireRole('Admin'), async (req, res) => {
  const id = Number(req.params.id);
  const publisher = await get('SELECT * FROM publishers WHERE id = ?', [id]);
  if (!publisher) return sendError(res, 'Publisher not found', 'not_found', 404);
  await run('DELETE FROM publishers WHERE id = ?', [id]);
  return sendSuccess(res, publisher);
});

module.exports = router;
