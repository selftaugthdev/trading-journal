const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const { type } = req.query;
  const sql = type
    ? 'SELECT * FROM tags WHERE type = ? ORDER BY name'
    : 'SELECT * FROM tags ORDER BY type, name';
  res.json(type ? db.prepare(sql).all(type) : db.prepare(sql).all());
});

router.post('/', (req, res) => {
  const { name, type, color = '#8B5CF6' } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name and type required' });
  try {
    const info = db.prepare('INSERT INTO tags (name, type, color) VALUES (?, ?, ?)').run(name, type, color);
    res.json(db.prepare('SELECT * FROM tags WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const { name, color } = req.body;
  db.prepare('UPDATE tags SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?')
    .run(name ?? null, color ?? null, req.params.id);
  res.json(db.prepare('SELECT * FROM tags WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
