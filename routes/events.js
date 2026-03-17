const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb, saveDb } = require('../database/db');

// GET all events
router.get('/', async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM events ORDER BY event_date, event_time');
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

// GET single event
router.get('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const stmt = db.prepare('SELECT * FROM events WHERE id = ?');
    stmt.bind([req.params.id]);

    if (stmt.step()) {
      const event = stmt.getAsObject();
      stmt.free();
      res.json({ error: false, data: event });
    } else {
      stmt.free();
      res.status(404).json({ error: true, message: 'Event not found' });
    }
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST create event
router.post('/', async (req, res) => {
  try {
    const db = await getDb();
    const { name, description, location, location_url, event_date, event_time, image_url } = req.body;

    if (!name) {
      return res.status(400).json({ error: true, message: 'Event name is required' });
    }

    const id = 'event_' + uuidv4().split('-')[0];
    const now = new Date().toISOString();

    db.run('INSERT INTO events (id, name, description, location, location_url, event_date, event_time, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, description || '', location || '', location_url || '', event_date || '', event_time || '', image_url || '', now]);
    saveDb();

    const stmt = db.prepare('SELECT * FROM events WHERE id = ?');
    stmt.bind([id]);
    stmt.step();
    const event = stmt.getAsObject();
    stmt.free();

    res.status(201).json({ error: false, data: event, message: 'Event created successfully' });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// PUT update event
router.put('/:id', async (req, res) => {
  try {
    const db = await getDb();
    const { name, description, location, location_url, event_date, event_time, image_url } = req.body;

    db.run('UPDATE events SET name = ?, description = ?, location = ?, location_url = ?, event_date = ?, event_time = ?, image_url = ? WHERE id = ?',
      [name, description || '', location || '', location_url || '', event_date || '', event_time || '', image_url || '', req.params.id]);
    saveDb();

    const stmt = db.prepare('SELECT * FROM events WHERE id = ?');
    stmt.bind([req.params.id]);

    if (stmt.step()) {
      const event = stmt.getAsObject();
      stmt.free();
      res.json({ error: false, data: event, message: 'Event updated successfully' });
    } else {
      stmt.free();
      res.status(404).json({ error: true, message: 'Event not found' });
    }
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// DELETE event
router.delete('/:id', async (req, res) => {
  try {
    const db = await getDb();
    db.run('DELETE FROM events WHERE id = ?', [req.params.id]);
    saveDb();
    res.json({ error: false, message: 'Event deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

module.exports = router;
