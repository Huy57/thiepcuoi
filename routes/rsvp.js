const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb, saveDb } = require('../database/db');

// Search guests for RSVP (public endpoint)
router.post('/search', async (req, res) => {
  try {
    const db = await getDb();
    const { name, website_id } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: true, message: 'Vui lòng nhập thông tin để tìm kiếm' });
    }

    const searchTerm = '%' + name.toLowerCase() + '%';
    const stmt = db.prepare(`
      SELECT id, name, phone, code, event_ids
      FROM guests
      WHERE LOWER(name) LIKE ? OR phone LIKE ? OR LOWER(code) LIKE ?
    `);
    stmt.bind([searchTerm, searchTerm, searchTerm]);

    const guests = [];
    while (stmt.step()) {
      guests.push(stmt.getAsObject());
    }
    stmt.free();

    if (guests.length === 0) {
      return res.json({ error: true, message: 'Không tìm thấy bạn trong danh sách khách mời' });
    }

    // Format response to match frontend expectation (MongoDB-style)
    const formattedGuests = guests.map(g => ({
      _id: { $oid: g.id },
      website_id: { $oid: website_id || '6940cad0b958151b45041694' },
      name: g.name,
      phone: g.phone,
      code: g.code,
      event_id: g.event_ids ? g.event_ids.split(',')[0] : ''
    }));

    res.json({ error: false, data: formattedGuests });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Get guest invitation details
router.get('/invitation/:guestId', async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM guests WHERE id = ?');
    stmt.bind([req.params.guestId]);

    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: true, message: 'Guest not found' });
    }
    const guest = stmt.getAsObject();
    stmt.free();

    // Get events for this guest
    const eventIds = guest.event_ids ? guest.event_ids.split(',') : [];
    let events = [];

    if (eventIds.length > 0) {
      const placeholders = eventIds.map(() => '?').join(',');
      const stmtEvents = db.prepare('SELECT * FROM events WHERE id IN (' + placeholders + ')');
      stmtEvents.bind(eventIds);
      while (stmtEvents.step()) {
        events.push(stmtEvents.getAsObject());
      }
      stmtEvents.free();
    }

    // Get existing RSVP
    const stmtRsvp = db.prepare('SELECT * FROM rsvp WHERE guest_id = ?');
    stmtRsvp.bind([guest.id]);
    const rsvp = [];
    while (stmtRsvp.step()) {
      rsvp.push(stmtRsvp.getAsObject());
    }
    stmtRsvp.free();

    res.json({
      error: false,
      data: { guest, events, rsvp }
    });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Submit RSVP confirmation (for known guests)
router.post('/confirm', async (req, res) => {
  try {
    const db = await getDb();
    const { guest_id, event_ids, attendance_status, plus_ones, message } = req.body;

    if (!guest_id) {
      return res.status(400).json({ error: true, message: 'Guest ID is required' });
    }

    const stmt = db.prepare('SELECT * FROM guests WHERE id = ?');
    stmt.bind([guest_id]);
    if (!stmt.step()) {
      stmt.free();
      return res.status(404).json({ error: true, message: 'Guest not found' });
    }
    const guest = stmt.getAsObject();
    stmt.free();

    // Delete existing RSVP for this guest
    db.run('DELETE FROM rsvp WHERE guest_id = ?', [guest_id]);

    // Insert new RSVP entries
    const eventIdList = Array.isArray(event_ids) ? event_ids : [event_ids];
    const statusList = Array.isArray(attendance_status) ? attendance_status : [attendance_status];
    const plusOnesList = Array.isArray(plus_ones) ? plus_ones : [plus_ones];
    const now = new Date().toISOString();

    for (let i = 0; i < eventIdList.length; i++) {
      if (!eventIdList[i]) continue;
      const id = uuidv4();
      db.run('INSERT INTO rsvp (id, guest_id, guest_name, guest_phone, guest_email, event_id, attendance_status, plus_ones, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, guest_id, guest.name, guest.phone || '', guest.email || '', eventIdList[i], parseInt(statusList[i]) || 0, parseInt(plusOnesList[i]) || 0, message || '', now]);
    }
    saveDb();

    res.json({ error: false, message: 'Xác nhận thành công. Xin chân thành cảm ơn quý khách!' });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// Free confirm (for guests not in list - called from rsvp.html)
router.post('/free-confirm', async (req, res) => {
  try {
    const db = await getDb();
    const { name, phone, email, event_ids, attendance_status, plus_ones } = req.body;

    if (!name) {
      return res.status(400).json({ error: true, message: 'Vui lòng nhập tên của bạn' });
    }

    const eventIdList = Array.isArray(event_ids) ? event_ids : (event_ids ? [event_ids] : []);
    const statusList = Array.isArray(attendance_status) ? attendance_status : (attendance_status ? [attendance_status] : []);
    const plusOnesList = Array.isArray(plus_ones) ? plus_ones : (plus_ones ? [plus_ones] : []);
    const now = new Date().toISOString();

    for (let i = 0; i < eventIdList.length; i++) {
      if (!eventIdList[i]) continue;
      const id = uuidv4();
      db.run('INSERT INTO rsvp (id, guest_id, guest_name, guest_phone, guest_email, event_id, attendance_status, plus_ones, is_free_confirm, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
        [id, null, name, phone || '', email || '', eventIdList[i], parseInt(statusList[i]) || 0, parseInt(plusOnesList[i]) || 0, now]);
    }
    saveDb();

    res.json({ error: false, message: 'Xác nhận thành công. Xin chân thành cảm ơn quý khách!' });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// GET all RSVP (admin)
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const { event_id, status } = req.query;

    let conditions = ['1=1'];
    let params = [];

    if (event_id) {
      conditions.push('r.event_id = ?');
      params.push(event_id);
    }
    if (status !== undefined && status !== '') {
      conditions.push('r.attendance_status = ?');
      params.push(parseInt(status));
    }

    const query = `
      SELECT r.*, e.name as event_name
      FROM rsvp r
      LEFT JOIN events e ON r.event_id = e.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY r.created_at DESC
    `;

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

// DELETE RSVP
router.delete('/:id', async (req, res) => {
  try {
    const db = await getDb();
    db.run('DELETE FROM rsvp WHERE id = ?', [req.params.id]);
    saveDb();
    res.json({ error: false, message: 'RSVP deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST import RSVP from Excel
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
      db.run('DELETE FROM rsvp');
    }

    const now = new Date().toISOString();
    let imported = 0;

    for (const row of data) {
      if (!row.guest_name || !row.guest_name.trim()) continue;

      // Map status text → number
      let status = 0;
      if (typeof row.attendance_status === 'string') {
        if (row.attendance_status.includes('tham gia') || row.attendance_status.includes('tham dự')) status = 1;
        else if (row.attendance_status.includes('không') || row.attendance_status.includes('Không')) status = 2;
      } else {
        status = parseInt(row.attendance_status) || 0;
      }

      // Map event name → id
      const eventId = eventLookup[row.event_name] || row.event_name || '';

      const id = uuidv4();
      db.run('INSERT INTO rsvp (id, guest_id, guest_name, guest_phone, guest_email, event_id, attendance_status, plus_ones, message, is_free_confirm, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)',
        [id, null, row.guest_name.trim(), row.guest_phone || '', row.guest_email || '', eventId, status, parseInt(row.plus_ones) || 0, row.message || '', now]);
      imported++;
    }

    saveDb();
    res.json({ error: false, message: `Import thành công ${imported} bản ghi RSVP`, count: imported });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

module.exports = router;
