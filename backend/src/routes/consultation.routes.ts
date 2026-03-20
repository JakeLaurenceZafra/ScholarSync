import { Router } from 'express';
import pool from '../Config/supabaseconfig.js';
import jwt from 'jsonwebtoken';

const router = Router();

// Middleware to verify JWT token
const authenticate = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET || 'test');
    req.user = user;
    next();
  } catch {
    return res.sendStatus(403);
  }
};

// GET slots for an adviser
router.get('/slots/adviser/:adviserId', authenticate, async (req, res) => {
  try {
    const { adviserId } = req.params;
    
    const { rows } = await pool.query(
      `SELECT * FROM consultation_slots WHERE adviser_id = $1 ORDER BY slot_date, start_time`,
      [adviserId]
    );
    
    return res.json(rows);
  } catch (error: any) {
    console.error('Error fetching consultation slots:', error);
    return res.status(500).json({ error: 'Failed to fetch consultation slots' });
  }
});

// POST create consultation slot(s)
router.post('/slots', authenticate, async (req, res) => {
  try {
    const {
      courseId,
      slotDate,
      startTime,
      endTime,
      slotType,
      maxGroups,
      selectedGroups,
      isWholeDay,
      multipleSlots
    } = req.body;

    const user: any = req.user;
    const adviserId = user.id;

    // Validate required fields
    if (!courseId || !slotDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // If multiple slots (whole week), create multiple entries
    if (multipleSlots && multipleSlots.length > 0) {
      const insertPromises = multipleSlots.map((date: string) => {
        if (isWholeDay) {
          // Create morning and afternoon slots
          return Promise.all([
            pool.query(
              `INSERT INTO consultation_slots (adviser_id, course_id, slot_date, start_time, end_time, slot_type, max_groups, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'available') RETURNING *`,
              [adviserId, courseId, date, '08:00', '12:00', slotType, maxGroups]
            ),
            pool.query(
              `INSERT INTO consultation_slots (adviser_id, course_id, slot_date, start_time, end_time, slot_type, max_groups, status)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'available') RETURNING *`,
              [adviserId, courseId, date, '13:00', '17:00', slotType, maxGroups]
            )
          ]);
        } else {
          return pool.query(
            `INSERT INTO consultation_slots (adviser_id, course_id, slot_date, start_time, end_time, slot_type, max_groups, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'available') RETURNING *`,
            [adviserId, courseId, date, startTime, endTime, slotType, maxGroups]
          );
        }
      });

      await Promise.all(insertPromises);
      return res.json({ success: true, message: 'Consultation slots created successfully' });
    }

    // Single slot or whole day
    if (isWholeDay) {
      // Create morning slot
      await pool.query(
        `INSERT INTO consultation_slots (adviser_id, course_id, slot_date, start_time, end_time, slot_type, max_groups, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'available')`,
        [adviserId, courseId, slotDate, '08:00', '12:00', slotType, maxGroups]
      );
      
      // Create afternoon slot
      await pool.query(
        `INSERT INTO consultation_slots (adviser_id, course_id, slot_date, start_time, end_time, slot_type, max_groups, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'available')`,
        [adviserId, courseId, slotDate, '13:00', '17:00', slotType, maxGroups]
      );
    } else {
      // Single time slot
      await pool.query(
        `INSERT INTO consultation_slots (adviser_id, course_id, slot_date, start_time, end_time, slot_type, max_groups, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'available')`,
        [adviserId, courseId, slotDate, startTime, endTime, slotType, maxGroups]
      );
    }

    return res.json({ success: true, message: 'Consultation slot created successfully' });
  } catch (error: any) {
    console.error('Error creating consultation slot:', error);
    return res.status(500).json({ error: 'Failed to create consultation slot' });
  }
});

// DELETE consultation slot
router.delete('/slots/:slotId', authenticate, async (req, res) => {
  try {
    const { slotId } = req.params;
    
    await pool.query('DELETE FROM consultation_slots WHERE slot_id = $1', [slotId]);
    
    return res.json({ success: true, message: 'Slot deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting slot:', error);
    return res.status(500).json({ error: 'Failed to delete slot' });
  }
});

// DELETE all slots for a specific day
router.delete('/slots/day/:date', authenticate, async (req, res) => {
  try {
    const { date } = req.params;
    const user: any = req.user;
    
    await pool.query(
      'DELETE FROM consultation_slots WHERE slot_date = $1 AND adviser_id = $2',
      [date, user.id]
    );
    
    return res.json({ success: true, message: 'Day slots deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting day slots:', error);
    return res.status(500).json({ error: 'Failed to delete day slots' });
  }
});

// PUT update consultation slot
router.put('/slots/:slotId', authenticate, async (req, res) => {
  try {
    const { slotId } = req.params;
    const { startTime, endTime, maxGroups, slotType } = req.body;
    
    await pool.query(
      `UPDATE consultation_slots 
       SET start_time = $1, end_time = $2, max_groups = $3, slot_type = $4
       WHERE slot_id = $5`,
      [startTime, endTime, maxGroups, slotType, slotId]
    );
    
    return res.json({ success: true, message: 'Slot updated successfully' });
  } catch (error: any) {
    console.error('Error updating slot:', error);
    return res.status(500).json({ error: 'Failed to update slot' });
  }
});

// PUT update all slots for a specific day
router.put('/slots/day/:date', authenticate, async (req, res) => {
  try {
    const { date } = req.params;
    const { startTime, endTime, maxGroups, slotType } = req.body;
    const user: any = req.user;
    
    await pool.query(
      `UPDATE consultation_slots 
       SET start_time = $1, end_time = $2, max_groups = $3, slot_type = $4
       WHERE slot_date = $5 AND adviser_id = $6`,
      [startTime, endTime, maxGroups, slotType, date, user.id]
    );
    
    return res.json({ success: true, message: 'Day slots updated successfully' });
  } catch (error: any) {
    console.error('Error updating day slots:', error);
    return res.status(500).json({ error: 'Failed to update day slots' });
  }
});

// GET bookings for a specific slot
router.get('/bookings/slot/:slotId', authenticate, async (req, res) => {
  try {
    const { slotId } = req.params;
    
    const { rows } = await pool.query(
      `SELECT * FROM consultation_bookings WHERE slot_id = $1 ORDER BY booked_at`,
      [slotId]
    );
    
    return res.json(rows);
  } catch (error: any) {
    console.error('Error fetching bookings:', error);
    return res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

export default router;
