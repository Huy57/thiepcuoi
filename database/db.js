const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const dbPath = path.join(__dirname, 'wedding.db');
let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  return db;
}

function saveDb() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

async function initialize() {
  const db = await getDb();

  // Events table
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      location TEXT DEFAULT '',
      location_url TEXT DEFAULT '',
      event_date TEXT DEFAULT '',
      event_time TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Guests table
  db.run(`
    CREATE TABLE IF NOT EXISTS guests (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      code TEXT UNIQUE,
      event_ids TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // RSVP table
  db.run(`
    CREATE TABLE IF NOT EXISTS rsvp (
      id TEXT PRIMARY KEY,
      guest_id TEXT,
      guest_name TEXT NOT NULL,
      guest_phone TEXT DEFAULT '',
      guest_email TEXT DEFAULT '',
      event_id TEXT,
      attendance_status INTEGER DEFAULT 0,
      plus_ones INTEGER DEFAULT 0,
      message TEXT DEFAULT '',
      is_free_confirm INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Wishes table
  db.run(`
    CREATE TABLE IF NOT EXISTS wishes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT DEFAULT '',
      content TEXT NOT NULL,
      is_approved INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Config table
  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Seed events with correct IDs matching frontend
  const eventCount = db.exec('SELECT COUNT(*) as count FROM events');
  if (!eventCount.length || eventCount[0].values[0][0] === 0) {
    const now = new Date().toISOString();
    const events = [
      ['6940cad0b958151b4504168c', 'Lễ Vu Quy Nhà Gái', 'Tư Gia Nhà Gái', 'Thôn Thống Nhất, xã Hải Lựu, Vĩnh Phúc', 'https://maps.app.goo.gl/cEGFeqWuEUquC6ge7', '2026-03-29', '10:00', '/asset/Couple%20Section/girl.JPG'],
      ['6940cad0b958151b4504168f', 'Lễ Thành Hôn', 'Tư Gia Nhà Trai', 'Thôn Dân Chủ, xã Hải Lựu, Vĩnh Phúc', 'https://maps.app.goo.gl/58wiykWxRptHLok99', '2026-03-29', '11:00', '/asset/Gallery/image2.JPG'],
    ];
    for (const e of events) {
      db.run('INSERT INTO events (id, name, description, location, location_url, event_date, event_time, image_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [...e, now]);
    }
    console.log('Default events inserted');
  }

  // Seed sample guests matching frontend fake data
  const guestCount = db.exec('SELECT COUNT(*) as count FROM guests');
  if (!guestCount.length || guestCount[0].values[0][0] === 0) {
    const now = new Date().toISOString();
    const guests = [
      [uuidv4(), 'Nguyễn Văn An', '0901234567', '', 'KM001', '6940cad0b958151b4504168c'],
      [uuidv4(), 'Trần Thị Bình', '0912345678', '', 'KM002', '6940cad0b958151b4504168f'],
      [uuidv4(), 'Lê Hoàng Nam', '0923456789', '', 'KM003', '6940cad0b958151b4504168c'],
      [uuidv4(), 'Phạm Minh Tuấn', '0934567890', '', 'KM004', '6940cad0b958151b4504168f'],
      [uuidv4(), 'Hoàng Thị Mai', '0945678901', '', 'KM005', '6940cad0b958151b4504168c'],
    ];
    for (const g of guests) {
      db.run('INSERT INTO guests (id, name, phone, email, code, event_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [...g, now]);
    }
    console.log('Sample guests inserted');
  }

  // Seed existing wishes from frontend
  const wishCount = db.exec('SELECT COUNT(*) as count FROM wishes');
  if (!wishCount.length || wishCount[0].values[0][0] === 0) {
    const now = new Date().toISOString();
    const wishes = [
      ['Chị Hương 🐼', 'Chúc mừng hạnh phúc 2 em! Chúc các e tôi 3 năm 2 đứa, nhiều tiền nhiều đất, hạnh phúc trọn đời'],
      ['nguyen duc huy', 'chúc anh chị trăm năm hạnh phúc🥹'],
      ['Quỳnh Vân', 'Chúc mừng hạnh phúc vợ chồng bạn. Chúc tổ ấm mới luôn hòa thuận, vẹn toàn, trăm năm hạnh phúc ❤️'],
      ['Anh Quang', 'Chúc đôi bạn trẻ trăm năm hạnh phúc'],
      ['Tùng Shine', 'Chúc đôi bạn hạnh phúc trọn đời trọn kiếp nhé'],
      ['Ngô Mạnh', 'Chúc 2 bạn trăm năm hạnh phúc 😍'],
      ['Ngọc Ánh', 'Chúc chị iu cụa em thật hạnh phúc bên người thương nha💕🫰🏻. Mãi iu chị, gửi ngàn nụ hôn từ Đloan về nhaaaa 🤣'],
      ['Anh Tú', 'Chúc mừng hạnh phúc đôi bạn trẻ, thuận vợ thuận chồng biển đông không phải là vấn đề nhé 🥳'],
      ['Long At', 'Chúc hai bạn trăm năm hạnh phúc, đầu bạc răng long😍'],
      ['Thu Doan xinh đẹp', 'Sớm đẻ sinh đôi, xong lại sinh ba là đẹp một nhà🫶'],
      ['CEO của Biihappy', '"Một cuộc hôn nhân thành công đòi hỏi phải yêu nhiều lần, và luôn ở cùng một người" - Chúc cho hai bạn sẽ có được một cuộc hôn nhân viên mãn, trăm năm hạnh phúc!'],
    ];
    for (const w of wishes) {
      db.run('INSERT INTO wishes (id, name, email, content, is_approved, created_at) VALUES (?, ?, ?, ?, 1, ?)',
        [uuidv4(), w[0], '', w[1], now]);
    }
    console.log('Existing wishes seeded');
  }

  saveDb();
  console.log('Database initialized successfully');
}

// Helper to convert sql.js result to array of objects
function resultToObjects(result) {
  if (!result || result.length === 0) return [];
  const columns = result[0].columns;
  return result[0].values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

module.exports = {
  getDb,
  saveDb,
  initialize,
  resultToObjects
};
