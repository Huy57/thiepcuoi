const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb, saveDb, resultToObjects } = require('../database/db');

// Generate unique guest code
async function generateCode() {
  const db = await getDb();
  const result = db.exec('SELECT COUNT(*) as count FROM guests');
  const count = result.length > 0 ? result[0].values[0][0] : 0;
  return 'KM' + String(count + 1).padStart(3, '0');
}

// GET all guests
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const { search, event_id } = req.query;

    let conditions = ['1=1'];
    let params = [];

    if (search) {
      const s = '%' + search.toLowerCase() + '%';
      conditions.push('(LOWER(name) LIKE ? OR phone LIKE ? OR LOWER(code) LIKE ?)');
      params.push(s, s, s);
    }
    if (event_id) {
      conditions.push('event_ids LIKE ?');
      params.push('%' + event_id + '%');
    }

    const query = 'SELECT * FROM guests WHERE ' + conditions.join(' AND ') + ' ORDER BY created_at DESC';
    const stmt = db.prepare(query);
    stmt.bind(params);

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

// GET single guest
router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM guests WHERE id = ?');
    stmt.bind([req.params.id]);

    if (stmt.step()) {
      const guest = stmt.getAsObject();
      stmt.free();
      res.json({ error: false, data: guest });
    } else {
      stmt.free();
      res.status(404).json({ error: true, message: 'Guest not found' });
    }
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST create guest
router.post('/', async (req, res) => {
  try {
    const db = await getDb();
    const { name, phone, email, event_ids, notes } = req.body;

    if (!name) {
      return res.status(400).json({ error: true, message: 'Name is required' });
    }

    const id = uuidv4();
    const code = await generateCode();
    const eventIdsStr = Array.isArray(event_ids) ? event_ids.join(',') : event_ids || '';
    const now = new Date().toISOString();

    db.run('INSERT INTO guests (id, name, phone, email, code, event_ids, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, phone || '', email || '', code, eventIdsStr, notes || '', now]);
    saveDb();

    const stmt = db.prepare('SELECT * FROM guests WHERE id = ?');
    stmt.bind([id]);
    stmt.step();
    const guest = stmt.getAsObject();
    stmt.free();

    res.status(201).json({ error: false, data: guest, message: 'Guest created successfully' });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT update guest
router.put('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const { name, phone, email, event_ids, notes } = req.body;
    const eventIdsStr = Array.isArray(event_ids) ? event_ids.join(',') : event_ids || '';

    db.run('UPDATE guests SET name = ?, phone = ?, email = ?, event_ids = ?, notes = ? WHERE id = ?',
      [name, phone || '', email || '', eventIdsStr, notes || '', req.params.id]);
    saveDb();

    const stmt = db.prepare('SELECT * FROM guests WHERE id = ?');
    stmt.bind([req.params.id]);

    if (stmt.step()) {
      const guest = stmt.getAsObject();
      stmt.free();
      res.json({ error: false, data: guest, message: 'Guest updated successfully' });
    } else {
      stmt.free();
      res.status(404).json({ error: true, message: 'Guest not found' });
    }
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// DELETE guest
router.delete('/:id', async (req, res) => {
  try {
    const db = await getDb();
    db.run('DELETE FROM guests WHERE id = ?', [req.params.id]);
    saveDb();
    res.json({ error: false, message: 'Guest deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST import guests from Excel
router.post('/import', async (req, res) => {
  try {
    const db = await getDb();
    const { mode, data } = req.body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: true, message: 'Không có dữ liệu để import' });
    }

    // Build event name → id lookup
    const evResult = db.exec('SELECT id, name FROM events');
    const eventLookup = {};
    if (evResult.length) {
      evResult[0].values.forEach(row => { eventLookup[row[1]] = row[0]; });
    }

    if (mode === 'replace') {
      db.run('DELETE FROM guests');
    }

    // Get current max code number for auto-generation
    const codeResult = db.exec("SELECT code FROM guests WHERE code LIKE 'KM%' ORDER BY code DESC LIMIT 1");
    let codeNum = 0;
    if (codeResult.length && codeResult[0].values.length) {
      codeNum = parseInt(codeResult[0].values[0][0].replace('KM', '')) || 0;
    }

    const now = new Date().toISOString();
    let imported = 0;

    for (const row of data) {
      if (!row.name || !row.name.trim()) continue;
      codeNum++;
      const code = 'KM' + String(codeNum).padStart(3, '0');

      // Map event names to IDs
      let eventIds = '';
      if (row.event_names) {
        const names = row.event_names.split(',').map(s => s.trim());
        const ids = names.map(n => eventLookup[n]).filter(Boolean);
        eventIds = ids.join(',');
      }

      const id = uuidv4();
      db.run('INSERT INTO guests (id, name, phone, email, code, event_ids, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [id, row.name.trim(), row.phone || '', row.email || '', code, eventIds, row.notes || '', now]);
      imported++;
    }

    saveDb();
    res.json({ error: false, message: `Import thành công ${imported} khách mời`, count: imported });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

module.exports = router;
