const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files for admin panel
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/asset', express.static(path.join(__dirname, 'asset')));

// Serve frontend wedding website
// Priority: ./public/wedding (deploy) > ../nguyenhungtrangmy2812.iwedding.info (dev)
const weddingDir = fs.existsSync(path.join(__dirname, 'public/wedding'))
  ? path.join(__dirname, 'public/wedding')
  : path.join(__dirname, '../nguyenhungtrangmy2812.iwedding.info');
app.use('/wedding', express.static(weddingDir));

// ============================================
// Frontend compatibility routes
// (FE calls these URLs directly)
// ============================================

// POST /wish - called by index.html wish form
app.post('/wish', async (req, res) => {
  try {
    const database = await db.getDb();
    const { name, email, content } = req.body;

    if (!name || !content) {
      return res.status(400).json({ error: true, message: 'Vui lòng nhập tên và lời chúc' });
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    database.run('INSERT INTO wishes (id, name, email, content, is_approved, created_at) VALUES (?, ?, ?, ?, 1, ?)',
      [id, name, email || '', content, now]);
    db.saveDb();

    res.json({ error: false, message: 'Cảm ơn bạn đã gửi lời chúc!' });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST /free-confirm - called by rsvp.html RSVP form
app.post('/free-confirm', async (req, res) => {
  try {
    const database = await db.getDb();
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
      database.run('INSERT INTO rsvp (id, guest_id, guest_name, guest_phone, guest_email, event_id, attendance_status, plus_ones, is_free_confirm, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
        [id, null, name, phone || '', email || '', eventIdList[i], parseInt(statusList[i]) || 0, parseInt(plusOnesList[i]) || 0, now]);
    }
    db.saveDb();

    res.json({ error: false, message: 'Xác nhận thành công. Xin chân thành cảm ơn quý khách!' });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// ============================================
// API Routes
// ============================================
app.use('/api/guests', require('./routes/guests'));
app.use('/api/rsvp', require('./routes/rsvp'));
app.use('/api/wishes', require('./routes/wishes'));
app.use('/api/events', require('./routes/events'));
app.use('/api/config', require('./routes/config'));
app.use('/api/stats', require('./routes/stats'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Wedding Backend is running!' });
});

// Admin panel redirect
app.get('/', (req, res) => {
  res.redirect('/wedding/index.html');
});

// Initialize database and start server
db.initialize().then(() => {
  app.listen(PORT, () => {
    console.log(`Wedding Backend running at http://localhost:${PORT}`);
    console.log(`Admin Panel: http://localhost:${PORT}/admin`);
    console.log(`Wedding Site: http://localhost:${PORT}/wedding/index.html`);
    console.log(`RSVP Page:    http://localhost:${PORT}/wedding/rsvp.html`);
    console.log(`API Endpoint: http://localhost:${PORT}/api`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
