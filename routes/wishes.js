const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb, saveDb } = require('../database/db');

// GET all wishes (public - only approved, admin - all)
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const { all } = req.query;
    const query = all === 'true'
      ? 'SELECT * FROM wishes ORDER BY created_at DESC'
      : 'SELECT * FROM wishes WHERE is_approved = 1 ORDER BY created_at DESC';

    const stmt = db.prepare(query);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();

    res.json({ error: false, data: rows });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET single wish
router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM wishes WHERE id = ?');
    stmt.bind([req.params.id]);

    if (stmt.step()) {
      const wish = stmt.getAsObject();
      stmt.free();
      res.json({ error: false, data: wish });
    } else {
      stmt.free();
      res.status(404).json({ error: true, message: 'Wish not found' });
    }
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST create wish (public)
router.post('/', async (req, res) => {
  try {
    const db = await getDb();
    const { name, email, content } = req.body;

    if (!name || !content) {
      return res.status(400).json({ error: true, message: 'Vui lòng nhập tên và lời chúc' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    db.run('INSERT INTO wishes (id, name, email, content, is_approved, created_at) VALUES (?, ?, ?, ?, 1, ?)',
      [id, name, email || '', content, now]);
    saveDb();

    res.status(201).json({ error: false, message: 'Cảm ơn bạn đã gửi lời chúc!' });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT update wish (admin)
router.put('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const { name, email, content, is_approved } = req.body;

    db.run('UPDATE wishes SET name = ?, email = ?, content = ?, is_approved = ? WHERE id = ?',
      [name, email || '', content, is_approved ? 1 : 0, req.params.id]);
    saveDb();

    const stmt = db.prepare('SELECT * FROM wishes WHERE id = ?');
    stmt.bind([req.params.id]);

    if (stmt.step()) {
      const wish = stmt.getAsObject();
      stmt.free();
      res.json({ error: false, data: wish, message: 'Wish updated successfully' });
    } else {
      stmt.free();
      res.status(404).json({ error: true, message: 'Wish not found' });
    }
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PATCH toggle approval status
router.patch('/:id/approve', async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM wishes WHERE id = ?');
    stmt.bind([req.params.id]);

    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: true, message: 'Wish not found' });
    }
    const wish = stmt.getAsObject();
    stmt.free();

    const newStatus = wish.is_approved ? 0 : 1;
    db.run('UPDATE wishes SET is_approved = ? WHERE id = ?', [newStatus, req.params.id]);
    saveDb();

    const stmt2 = db.prepare('SELECT * FROM wishes WHERE id = ?');
    stmt2.bind([req.params.id]);
    stmt2.step();
    const updated = stmt2.getAsObject();
    stmt2.free();

    res.json({
      error: false,
      data: updated,
      message: newStatus ? 'Wish approved' : 'Wish hidden'
    });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// DELETE wish
router.delete('/:id', async (req, res) => {
  try {
    const db = await getDb();
    db.run('DELETE FROM wishes WHERE id = ?', [req.params.id]);
    saveDb();
    res.json({ error: false, message: 'Wish deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST import wishes from Excel
router.post('/import', async (req, res) => {
  try {
    const db = await getDb();
    const { mode, data } = req.body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: true, message: 'Không có dữ liệu để import' });
    }

    if (mode === 'replace') {
      db.run('DELETE FROM wishes');
    }

    const now = new Date().toISOString();
    let imported = 0;

    for (const row of data) {
      if (!row.name || !row.name.trim() || !row.content || !row.content.trim()) continue;

      let isApproved = 1;
      if (typeof row.is_approved === 'string') {
        isApproved = row.is_approved.includes('Chưa') ? 0 : 1;
      } else if (row.is_approved !== undefined) {
        isApproved = row.is_approved ? 1 : 0;
      }

      const id = uuidv4();
      db.run('INSERT INTO wishes (id, name, email, content, is_approved, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, row.name.trim(), row.email || '', row.content.trim(), isApproved, now]);
      imported++;
    }

    saveDb();
    res.json({ error: false, message: `Import thành công ${imported} lời chúc`, count: imported });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

module.exports = router;
