const express = require('express');
const router = express.Router();
const { getDb, saveDb } = require('../database/db');

// GET all config
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM config');
    const configObj = {};
    while (stmt.step()) {
      const row = stmt.getAsObject();
      try {
        configObj[row.key] = JSON.parse(row.value);
      } catch {
        configObj[row.key] = row.value;
      }
    }
    stmt.free();
    res.json({ error: false, data: configObj });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET single config
router.get('/:key', async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM config WHERE key = ?');
    stmt.bind([req.params.key]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      let value = row.value;
      try { value = JSON.parse(value); } catch {}
      res.json({ error: false, data: { key: row.key, value } });
    } else {
      stmt.free();
      res.status(404).json({ error: true, message: 'Config not found' });
    }
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT update/create config
router.put('/:key', async (req, res) => {
  try {
    const db = await getDb();
    const { value } = req.body;
    const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);

    db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
      [req.params.key, valueStr]);
    saveDb();

    res.json({ error: false, message: 'Config updated successfully' });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST bulk update config
router.post('/bulk', async (req, res) => {
  try {
    const db = await getDb();
    const configs = req.body;

    for (const [key, value] of Object.entries(configs)) {
      const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
      db.run('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)',
        [key, valueStr]);
    }
    saveDb();

    res.json({ error: false, message: 'Configs updated successfully' });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// DELETE config
router.delete('/:key', async (req, res) => {
  try {
    const db = await getDb();
    db.run('DELETE FROM config WHERE key = ?', [req.params.key]);
    saveDb();
    res.json({ error: false, message: 'Config deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

module.exports = router;
