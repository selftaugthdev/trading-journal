const express = require('express');
const db = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM accounts ORDER BY name').all();
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name, starting_balance = 0 } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const info = db.prepare('INSERT INTO accounts (name, starting_balance) VALUES (?, ?)').run(name, starting_balance);
    res.json(db.prepare('SELECT * FROM accounts WHERE id = ?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const { name, starting_balance } = req.body;
  db.prepare('UPDATE accounts SET name = COALESCE(?, name), starting_balance = COALESCE(?, starting_balance) WHERE id = ?')
    .run(name ?? null, starting_balance ?? null, req.params.id);
  res.json(db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
