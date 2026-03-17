const express = require('express');
const router = express.Router();
const { getDb, resultToObjects } = require('../database/db');

// GET dashboard stats
router.get('/', async (req, res) => {
  try {
    const db = await getDb();

    // Total guests
    const guestResult = db.exec('SELECT COUNT(*) as count FROM guests');
    const totalGuests = guestResult.length > 0 ? guestResult[0].values[0][0] : 0;

    // Total RSVP
    const rsvpResult = db.exec('SELECT COUNT(*) as count FROM rsvp');
    const totalRsvp = rsvpResult.length > 0 ? rsvpResult[0].values[0][0] : 0;

    // RSVP by status
    const rsvpByStatusResult = db.exec(`
      SELECT
        attendance_status,
        COUNT(*) as count,
        SUM(plus_ones) as total_plus_ones
      FROM rsvp
      GROUP BY attendance_status
    `);
    const rsvpByStatus = resultToObjects(rsvpByStatusResult);

    const attending = rsvpByStatus.find(r => r.attendance_status === 1) || { count: 0, total_plus_ones: 0 };
    const notAttending = rsvpByStatus.find(r => r.attendance_status === 2) || { count: 0 };
    const pending = rsvpByStatus.find(r => r.attendance_status === 0) || { count: 0 };

    // RSVP by event
    const rsvpByEventResult = db.exec(`
      SELECT
        e.id,
        e.name,
        COUNT(r.id) as total_rsvp,
        SUM(CASE WHEN r.attendance_status = 1 THEN 1 ELSE 0 END) as attending,
        SUM(CASE WHEN r.attendance_status = 1 THEN r.plus_ones ELSE 0 END) as plus_ones,
        SUM(CASE WHEN r.attendance_status = 2 THEN 1 ELSE 0 END) as not_attending
      FROM events e
      LEFT JOIN rsvp r ON e.id = r.event_id
      GROUP BY e.id
    `);
    const rsvpByEvent = resultToObjects(rsvpByEventResult);

    // Total wishes
    const wishResult = db.exec('SELECT COUNT(*) as count FROM wishes');
    const totalWishes = wishResult.length > 0 ? wishResult[0].values[0][0] : 0;

    const approvedResult = db.exec('SELECT COUNT(*) as count FROM wishes WHERE is_approved = 1');
    const approvedWishes = approvedResult.length > 0 ? approvedResult[0].values[0][0] : 0;

    // Recent RSVP
    const recentRsvpResult = db.exec(`
      SELECT r.*, e.name as event_name
      FROM rsvp r
      LEFT JOIN events e ON r.event_id = e.id
      ORDER BY r.created_at DESC
      LIMIT 10
    `);
    const recentRsvp = resultToObjects(recentRsvpResult);

    // Recent wishes
    const recentWishesResult = db.exec('SELECT * FROM wishes ORDER BY created_at DESC LIMIT 10');
    const recentWishes = resultToObjects(recentWishesResult);

    res.json({
      error: false,
      data: {
        summary: {
          totalGuests,
          totalRsvp,
          attending: attending.count,
          attendingWithPlusOnes: attending.count + (attending.total_plus_ones || 0),
          notAttending: notAttending.count,
          pending: pending.count,
          totalWishes,
          approvedWishes
        },
        rsvpByEvent,
        recentRsvp,
        recentWishes
      }
    });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

module.exports = router;
