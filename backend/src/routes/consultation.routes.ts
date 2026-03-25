import { Router } from 'express';
import { pool } from '../db.js';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { GoogleDocsService } from '../googleDocsService.js';

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

const normalizeSlotDate = (raw: any): string => {
  if (raw instanceof Date) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const direct = String(raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
  const parsed = new Date(direct);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
};

const resolveStudentAssignedAdvisers = async (
  courseId: number,
  studentEmail: string,
  groupName?: string | null
): Promise<{ adviserKeys: string[]; adviserAccountIds: string[] }> => {
  const normalizedEmail = String(studentEmail || '').trim().toLowerCase();
  if (!normalizedEmail) return { adviserKeys: [], adviserAccountIds: [] };

  const normalizedGroupName = String(groupName || '').trim().toLowerCase();
  const params: any[] = [courseId, normalizedEmail];
  const groupFilterClause = normalizedGroupName
    ? ` AND LOWER(COALESCE(tg.name, '')) = $3`
    : '';
  if (normalizedGroupName) params.push(normalizedGroupName);

  const { rows } = await pool.query(
    `SELECT DISTINCT
       LOWER(TRIM(COALESCE(tg.adviser_name, ''))) AS adviser_key,
       tg.adviser_id
     FROM team_groups tg
     JOIN team_group_members tgm ON tgm.team_group_id = tg.id
     WHERE tg.course_id = $1
       AND LOWER(COALESCE(tgm.email, '')) = $2
       AND (
         COALESCE(TRIM(tg.adviser_name), '') <> ''
         OR tg.adviser_id IS NOT NULL
       )
       ${groupFilterClause}`,
    params
  );

  const adviserKeys = rows
    .map((row: any) => String(row.adviser_key || '').trim().toLowerCase())
    .filter((key: string) => key.length > 0);

  const directAdviserIds = rows
    .map((row: any) => String(row.adviser_id || '').trim())
    .filter((id: string) => id.length > 0);

  let matchedAccountIds: string[] = [];
  if (adviserKeys.length > 0) {
    const accountMatchRes = await pool.query(
      `SELECT DISTINCT account_id
       FROM ss_account
       WHERE LOWER(TRIM(COALESCE("accountEmail", ''))) = ANY($1::text[])
          OR LOWER(TRIM(COALESCE("accountName", ''))) = ANY($1::text[])`,
      [adviserKeys]
    );
    matchedAccountIds = accountMatchRes.rows
      .map((row: any) => String(row.account_id || '').trim())
      .filter((id: string) => id.length > 0);
  }

  const adviserAccountIds = Array.from(new Set([...directAdviserIds, ...matchedAccountIds]));
  return { adviserKeys, adviserAccountIds };
};

const getCalendarClientForAccount = async (accountId: number) => {
  const { rows } = await pool.query(
    'SELECT "googleAccessToken" FROM ss_account WHERE account_id = $1',
    [accountId]
  );
  const accessToken = rows[0]?.googleAccessToken;
  if (!accessToken) return null;

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({ version: 'v3', auth });
};

const createGoogleEventForSlot = async (
  ownerAccountId: number,
  slot: { slot_date: any; start_time: string; end_time: string },
  courseLabel: string
): Promise<string | null> => {
  const calendar = await getCalendarClientForAccount(ownerAccountId);
  if (!calendar) return null;

  const day = normalizeSlotDate(slot.slot_date);
  if (!day) return null;

  const startTime = String(slot.start_time || '').slice(0, 8);
  const endTime = String(slot.end_time || '').slice(0, 8);

  const created = await calendar.events.insert({
    calendarId: 'primary',
    resource: {
      summary: `Consultation Slot - ${courseLabel}`,
      description: `ScholarSync consultation slot`,
      start: { dateTime: `${day}T${startTime}`, timeZone: 'Asia/Manila' },
      end: { dateTime: `${day}T${endTime}`, timeZone: 'Asia/Manila' },
      location: 'ScholarSync',
    },
  } as any);

  return created.data?.id || null;
};

const upsertGoogleEventForSlot = async (
  ownerAccountId: number,
  slot: { slot_date: any; start_time: string; end_time: string },
  courseLabel: string,
  existingGoogleEventId?: string | null
): Promise<string | null> => {
  const calendar = await getCalendarClientForAccount(ownerAccountId);
  if (!calendar) return existingGoogleEventId || null;

  const day = normalizeSlotDate(slot.slot_date);
  if (!day) return existingGoogleEventId || null;

  const startTime = String(slot.start_time || '').slice(0, 8);
  const endTime = String(slot.end_time || '').slice(0, 8);

  const resource = {
    summary: `Consultation Slot - ${courseLabel}`,
    description: `ScholarSync consultation slot`,
    start: { dateTime: `${day}T${startTime}`, timeZone: 'Asia/Manila' },
    end: { dateTime: `${day}T${endTime}`, timeZone: 'Asia/Manila' },
    location: 'ScholarSync',
  };

  if (existingGoogleEventId) {
    try {
      const updated = await calendar.events.update({
        calendarId: 'primary',
        eventId: existingGoogleEventId,
        resource,
      } as any);
      return updated.data?.id || existingGoogleEventId;
    } catch (err: any) {
      const errorCode = err?.code || err?.status || err?.statusCode || err?.response?.status;
      if (errorCode !== 404 && errorCode !== 410) throw err;
    }
  }

  const created = await calendar.events.insert({
    calendarId: 'primary',
    resource,
  } as any);
  return created.data?.id || null;
};

const deleteGoogleEventForSlot = async (ownerAccountId: number, googleEventId: string) => {
  if (!googleEventId) return;
  const calendar = await getCalendarClientForAccount(ownerAccountId);
  if (!calendar) {
    throw new Error('Owner Google Calendar is not connected. Please reconnect Google and try again.');
  }

  try {
    await calendar.events.delete({ calendarId: 'primary', eventId: googleEventId } as any);
  } catch (err: any) {
    const errorCode = err?.code || err?.status || err?.statusCode || err?.response?.status;
    // Ignore 404/410 errors (event already deleted or gone)
    if (errorCode === 404 || errorCode === 410 || err?.message?.includes('Not Found')) return;
    throw err;
  }
};

// GET slots for an adviser
router.get('/slots/adviser/:adviserId', authenticate, async (req, res) => {
  try {
    const { adviserId } = req.params;
    
    console.log('Fetching slots for adviser ID:', adviserId);
    
    const { rows } = await pool.query(
      `SELECT
         s.*,
         s.slot_date::text as slot_date_only,
         sg."groupName" as reserved_group_name,
         COALESCE(b.current_groups, 0)::int as current_groups
       FROM ss_consultation_slots s
       LEFT JOIN ss_group sg ON sg."smallgroupID" = s.allowed_group_id
       LEFT JOIN (
         SELECT slot_id, COUNT(*)::int as current_groups
         FROM ss_consultation_bookings
         WHERE status = 'BOOKED'
         GROUP BY slot_id
       ) b ON b.slot_id = s.slot_id
       WHERE s.adviser_id = $1
         AND NOT (
           s.max_groups <= 1
           AND EXISTS (
             SELECT 1
             FROM ss_consultation_bookings bx
             WHERE bx.slot_id = s.slot_id
               AND bx.status = 'BOOKED'
               AND bx.consultation_id IS NOT NULL
           )
         )
       ORDER BY s.slot_date, s.start_time`,
      [adviserId]
    );
    
    console.log(`Found ${rows.length} slots for adviser ${adviserId}`);
    
    return res.json({ slots: rows });
  } catch (error: any) {
    console.error('Error fetching consultation slots:', error);
    return res.status(500).json({ error: 'Failed to fetch consultation slots' });
  }
});

// GET slots for a course (student-facing booking list)
router.get('/slots/:courseId', authenticate, async (req, res) => {
  try {
    const { courseId } = req.params;
    const user: any = req.user;
    const requesterRole = String(user?.role || '').trim().toLowerCase();
    const debugEnabled = ['1', 'true', 'yes'].includes(String(req.query.debug || '').trim().toLowerCase());
    const futureOnly = String(req.query.futureOnly || '').toLowerCase() === 'true';
    const groupName = String(req.query.groupName || '').trim() || null;
    const requesterEmail = String(user?.email || '').trim().toLowerCase();

    let assignedAdviserKeys: string[] = [];
    let assignedAdviserAccountIds: string[] = [];
    if (requesterRole === 'student') {
      const assignedAdvisers = await resolveStudentAssignedAdvisers(
        Number(courseId),
        requesterEmail,
        groupName
      );
      assignedAdviserKeys = assignedAdvisers.adviserKeys;
      assignedAdviserAccountIds = assignedAdvisers.adviserAccountIds;

      // Temporary diagnostics to verify adviser matching for student slot visibility.
      console.log(
        '[consultation-debug] student slot filter context:',
        JSON.stringify({
          courseId: Number(courseId),
          requesterEmail,
          groupName,
          assignedAdviserKeys,
          assignedAdviserAccountIds,
          futureOnly,
        })
      );
    }

    let preFilterSlotCount = 0;
    if (debugEnabled) {
      const preFilterRes = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM ss_consultation_slots s
         LEFT JOIN ss_group sg ON sg."smallgroupID" = s.allowed_group_id
         WHERE s.course_id = $1
           AND (
             NOT $2::boolean
             OR s.slot_date > CURRENT_DATE
             OR (s.slot_date = CURRENT_DATE AND s.end_time > CURRENT_TIME)
           )
           AND (
             $3::text IS NULL
             OR s.slot_type = 'FIRST_COME_FIRST_SERVE'
             OR LOWER(COALESCE(sg."groupName", '')) = LOWER($3::text)
           )`,
        [courseId, futureOnly, groupName]
      );
      preFilterSlotCount = Number(preFilterRes.rows[0]?.total || 0);
    }

    const { rows } = await pool.query(
      `SELECT
         s.*,
         s.slot_date::text as slot_date_only,
         a."accountName" as adviser_name,
        a."accountEmail" as adviser_email,
         sg."groupName" as reserved_group_name,
         COALESCE(b.current_groups, 0)::int as current_groups
       FROM ss_consultation_slots s
       LEFT JOIN ss_account a ON a.account_id = s.owner_account_id
       LEFT JOIN ss_group sg ON sg."smallgroupID" = s.allowed_group_id
       LEFT JOIN (
         SELECT slot_id, COUNT(*)::int as current_groups
         FROM ss_consultation_bookings
         WHERE status = 'BOOKED'
         GROUP BY slot_id
       ) b ON b.slot_id = s.slot_id
       WHERE s.course_id = $1
         AND (
           NOT $2::boolean
           OR s.slot_date > CURRENT_DATE
           OR (s.slot_date = CURRENT_DATE AND s.end_time > CURRENT_TIME)
         )
         AND (
           $3::text IS NULL
           OR s.slot_type = 'FIRST_COME_FIRST_SERVE'
           OR LOWER(COALESCE(sg."groupName", '')) = LOWER($3::text)
         )
         AND (
           (
             COALESCE(array_length($4::text[], 1), 0) = 0
             AND COALESCE(array_length($5::text[], 1), 0) = 0
           )
           OR CAST(s.adviser_id AS text) = ANY($4::text[])
           OR LOWER(TRIM(COALESCE(a."accountEmail", ''))) = ANY($5::text[])
           OR LOWER(TRIM(COALESCE(a."accountName", ''))) = ANY($5::text[])
         )
       ORDER BY s.slot_date, s.start_time`,
      [courseId, futureOnly, groupName, assignedAdviserAccountIds, assignedAdviserKeys]
    );

    if (requesterRole === 'student') {
      console.log(
        '[consultation-debug] student slot filter result:',
        JSON.stringify({
          courseId: Number(courseId),
          requesterEmail,
          returnedSlotCount: rows.length,
          returnedSlotSample: rows.slice(0, 5).map((r: any) => ({
            slot_id: r.slot_id,
            adviser_id: r.adviser_id,
            owner_account_id: r.owner_account_id,
            adviser_email: r.adviser_email,
            adviser_name: r.adviser_name,
          })),
        })
      );
    }

    const response: any = { slots: rows };
    if (debugEnabled) {
      response.debug = {
        role: requesterRole,
        courseId: Number(courseId),
        requesterEmail,
        groupName,
        futureOnly,
        assignedAdviserKeys,
        assignedAdviserAccountIds,
        preFilterSlotCount,
        postFilterSlotCount: rows.length,
      };
    }

    return res.json(response);
  } catch (error: any) {
    console.error('Error fetching course consultation slots:', error);
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

    const { rows: courseRows } = await pool.query(
      'SELECT "courseCode", "courseName" FROM ss_courses WHERE id = $1',
      [courseId]
    );
    const courseLabel = courseRows[0]?.courseCode || courseRows[0]?.courseName || `Course ${courseId}`;

    const createdSlots: any[] = [];

    // If multiple slots (whole week), create multiple entries
    if (multipleSlots && multipleSlots.length > 0) {
      for (const date of multipleSlots as string[]) {
        if (isWholeDay) {
          const morning = await pool.query(
            `INSERT INTO ss_consultation_slots (adviser_id, course_id, slot_date, start_time, end_time, slot_type, max_groups, owner_account_id, owner_role)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $1, 'Adviser') RETURNING slot_id, slot_date, start_time, end_time`,
            [adviserId, courseId, date, '08:00', '12:00', slotType, maxGroups]
          );
          const afternoon = await pool.query(
            `INSERT INTO ss_consultation_slots (adviser_id, course_id, slot_date, start_time, end_time, slot_type, max_groups, owner_account_id, owner_role)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $1, 'Adviser') RETURNING slot_id, slot_date, start_time, end_time`,
            [adviserId, courseId, date, '13:00', '17:00', slotType, maxGroups]
          );
          createdSlots.push(morning.rows[0], afternoon.rows[0]);
        } else {
          const single = await pool.query(
            `INSERT INTO ss_consultation_slots (adviser_id, course_id, slot_date, start_time, end_time, slot_type, max_groups, owner_account_id, owner_role)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $1, 'Adviser') RETURNING slot_id, slot_date, start_time, end_time`,
            [adviserId, courseId, date, startTime, endTime, slotType, maxGroups]
          );
          createdSlots.push(single.rows[0]);
        }
      }
    } else if (isWholeDay) {
      // Single date, whole day: create morning + afternoon slots
      const morning = await pool.query(
        `INSERT INTO ss_consultation_slots (adviser_id, course_id, slot_date, start_time, end_time, slot_type, max_groups, owner_account_id, owner_role)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $1, 'Adviser') RETURNING slot_id, slot_date, start_time, end_time`,
        [adviserId, courseId, slotDate, '08:00', '12:00', slotType, maxGroups]
      );
      const afternoon = await pool.query(
        `INSERT INTO ss_consultation_slots (adviser_id, course_id, slot_date, start_time, end_time, slot_type, max_groups, owner_account_id, owner_role)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $1, 'Adviser') RETURNING slot_id, slot_date, start_time, end_time`,
        [adviserId, courseId, slotDate, '13:00', '17:00', slotType, maxGroups]
      );
      createdSlots.push(morning.rows[0], afternoon.rows[0]);
    } else {
      // Single time slot
      const single = await pool.query(
        `INSERT INTO ss_consultation_slots (adviser_id, course_id, slot_date, start_time, end_time, slot_type, max_groups, owner_account_id, owner_role)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $1, 'Adviser') RETURNING slot_id, slot_date, start_time, end_time`,
        [adviserId, courseId, slotDate, startTime, endTime, slotType, maxGroups]
      );
      createdSlots.push(single.rows[0]);
    }

    for (const slot of createdSlots) {
      try {
        const googleEventId = await createGoogleEventForSlot(adviserId, slot, courseLabel);
        if (googleEventId) {
          await pool.query(
            'UPDATE ss_consultation_slots SET google_event_id = $1 WHERE slot_id = $2',
            [googleEventId, slot.slot_id]
          );
        }
      } catch (err: any) {
        console.warn('Failed to create Google Calendar event for slot:', err?.message || err);
      }
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
    const user: any = req.user;

    const { rows: slotRows } = await pool.query(
      'SELECT google_event_id, owner_account_id FROM ss_consultation_slots WHERE slot_id = $1 LIMIT 1',
      [slotId]
    );

    if (slotRows.length === 0) {
      return res.status(404).json({ error: 'Slot not found' });
    }

    const slot = slotRows[0];
    const requesterRole = String(user?.role || '');
    const canDelete = Number(slot.owner_account_id) === Number(user?.id) || requesterRole === 'Admin';
    if (!canDelete) {
      return res.status(403).json({ error: 'Only the slot owner or an admin can delete this consultation slot.' });
    }

    if (slot.google_event_id) {
      await deleteGoogleEventForSlot(slot.owner_account_id || user.id, slot.google_event_id);
    }
    
    await pool.query('DELETE FROM ss_consultation_slots WHERE slot_id = $1', [slotId]);
    
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
    const requesterRole = String(user?.role || '').toLowerCase();
    const canDeleteDay = requesterRole === 'admin' || requesterRole === 'adviser' || requesterRole === 'advisers';
    if (!canDeleteDay) {
      return res.status(403).json({ error: 'Only advisers/admins can delete day consultation slots.' });
    }

    const { rows: daySlots } = await pool.query(
      `SELECT slot_id, google_event_id, owner_account_id
       FROM ss_consultation_slots
       WHERE slot_date = $1 AND adviser_id = $2`,
      [date, user.id]
    );

    for (const slot of daySlots) {
      if (slot.google_event_id) {
        await deleteGoogleEventForSlot(slot.owner_account_id || user.id, slot.google_event_id);
      }
    }
    
    await pool.query(
      'DELETE FROM ss_consultation_slots WHERE slot_date = $1 AND adviser_id = $2',
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
    const { slotDate, startTime, endTime, maxGroups, slotType } = req.body;
    const user: any = req.user;

    const updateRes = await pool.query(
      `UPDATE ss_consultation_slots 
       SET slot_date = COALESCE($1, slot_date),
           start_time = COALESCE($2, start_time),
           end_time = COALESCE($3, end_time),
           max_groups = COALESCE($4, max_groups),
           slot_type = COALESCE($5, slot_type)
       WHERE slot_id = $6 AND adviser_id = $7`,
      [slotDate || null, startTime || null, endTime || null, maxGroups ?? null, slotType || null, slotId, user.id]
    );

    if (updateRes.rowCount === 0) {
      return res.status(404).json({ error: 'Slot not found or not owned by requester.' });
    }

    const { rows: updatedSlotRows } = await pool.query(
      `SELECT slot_id, course_id, slot_date, start_time, end_time, google_event_id, owner_account_id
       FROM ss_consultation_slots
       WHERE slot_id = $1
       LIMIT 1`,
      [slotId]
    );

    if (updatedSlotRows.length > 0) {
      const slot = updatedSlotRows[0];
      try {
        const { rows: courseRows } = await pool.query(
          'SELECT "courseCode", "courseName" FROM ss_courses WHERE id = $1',
          [slot.course_id]
        );
        const courseLabel = courseRows[0]?.courseCode || courseRows[0]?.courseName || `Course ${slot.course_id}`;
        const syncedGoogleEventId = await upsertGoogleEventForSlot(
          Number(slot.owner_account_id || user.id),
          slot,
          courseLabel,
          slot.google_event_id
        );

        if (syncedGoogleEventId && syncedGoogleEventId !== slot.google_event_id) {
          await pool.query(
            'UPDATE ss_consultation_slots SET google_event_id = $1 WHERE slot_id = $2',
            [syncedGoogleEventId, slot.slot_id]
          );
        }
      } catch (err: any) {
        console.warn('Failed to sync Google Calendar event for updated slot:', err?.message || err);
      }
    }
    
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
    const { newDate, extraGroups } = req.body;
    const user: any = req.user;

    const targetDate = String(newDate || date).slice(0, 10);

    if (!targetDate) {
      return res.status(400).json({ error: 'Target date is required.' });
    }

    // 1) Move all slots for the selected day to the new date (supports "edit day").
    await pool.query(
      `UPDATE ss_consultation_slots
       SET slot_date = $1
       WHERE slot_date = $2 AND adviser_id = $3`,
      [targetDate, String(date).slice(0, 10), user.id]
    );

    const { rows: movedSlots } = await pool.query(
      `SELECT slot_id, course_id, slot_date, start_time, end_time, google_event_id, owner_account_id
       FROM ss_consultation_slots
       WHERE slot_date = $1 AND adviser_id = $2
       ORDER BY start_time`,
      [targetDate, user.id]
    );

    // 2) Optionally add extra FCFS slots (1 hour each, 10-minute gap).
    const extraCount = Number(extraGroups || 0);
    const addedSlots: any[] = [];
    if (Number.isFinite(extraCount) && extraCount > 0) {
      const { rows: existingRows } = await pool.query(
        `SELECT course_id, end_time
         FROM ss_consultation_slots
         WHERE adviser_id = $1 AND slot_date = $2
         ORDER BY end_time DESC
         LIMIT 1`,
        [user.id, targetDate]
      );

      if (existingRows.length === 0) {
        return res.status(400).json({ error: 'No base slots found for the selected day.' });
      }

      const courseId = existingRows[0].course_id;
      const baseEnd = String(existingRows[0].end_time || '17:00').slice(0, 5);
      const [hRaw, mRaw] = baseEnd.split(':');
      const startAt = Number(hRaw) * 60 + Number(mRaw) + 10;

      for (let i = 0; i < extraCount; i++) {
        const slotStartMins = startAt + i * 70;
        const slotEndMins = slotStartMins + 60;

        const startH = String(Math.floor(slotStartMins / 60)).padStart(2, '0');
        const startM = String(slotStartMins % 60).padStart(2, '0');
        const endH = String(Math.floor(slotEndMins / 60)).padStart(2, '0');
        const endM = String(slotEndMins % 60).padStart(2, '0');

        const added = await pool.query(
          `INSERT INTO ss_consultation_slots
           (adviser_id, course_id, slot_date, start_time, end_time, slot_type, max_groups, owner_account_id, owner_role)
           VALUES ($1, $2, $3, $4, $5, 'FIRST_COME_FIRST_SERVE', 1, $1, 'Adviser')
           RETURNING slot_id, course_id, slot_date, start_time, end_time, google_event_id, owner_account_id`,
          [user.id, courseId, targetDate, `${startH}:${startM}`, `${endH}:${endM}`]
        );
        addedSlots.push(...added.rows);
      }
    }

    const allAffectedSlots = [...movedSlots, ...addedSlots];
    if (allAffectedSlots.length > 0) {
      const courseLabelCache = new Map<number, string>();

      for (const slot of allAffectedSlots) {
        try {
          const courseIdNum = Number(slot.course_id);
          if (!courseLabelCache.has(courseIdNum)) {
            const { rows: courseRows } = await pool.query(
              'SELECT "courseCode", "courseName" FROM ss_courses WHERE id = $1',
              [courseIdNum]
            );
            const courseLabel = courseRows[0]?.courseCode || courseRows[0]?.courseName || `Course ${courseIdNum}`;
            courseLabelCache.set(courseIdNum, courseLabel);
          }

          const syncedGoogleEventId = await upsertGoogleEventForSlot(
            Number(slot.owner_account_id || user.id),
            slot,
            courseLabelCache.get(courseIdNum) || `Course ${courseIdNum}`,
            slot.google_event_id
          );

          if (syncedGoogleEventId && syncedGoogleEventId !== slot.google_event_id) {
            await pool.query(
              'UPDATE ss_consultation_slots SET google_event_id = $1 WHERE slot_id = $2',
              [syncedGoogleEventId, slot.slot_id]
            );
          }
        } catch (err: any) {
          console.warn('Failed to sync Google Calendar event for day-updated slot:', err?.message || err);
        }
      }
    }
    
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
      `SELECT b.*, s.slot_date::text as slot_date_only
       FROM ss_consultation_bookings b
       LEFT JOIN ss_consultation_slots s ON s.slot_id = b.slot_id
       WHERE b.slot_id = $1
       ORDER BY b.created_at`,
      [slotId]
    );
    
    return res.json({ bookings: rows });
  } catch (error: any) {
    console.error('Error fetching bookings:', error);
    return res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// GET bookings for a group
router.get('/bookings/group/:groupId', authenticate, async (req, res) => {
  try {
    const { groupId } = req.params;
    const groupName = String(req.query.groupName || '').trim();

    const { rows } = await pool.query(
      `SELECT b.*, s.slot_date::text as slot_date_only
       FROM ss_consultation_bookings b
       LEFT JOIN ss_consultation_slots s ON s.slot_id = b.slot_id
       WHERE (b.group_id = $1 OR ($2::text <> '' AND LOWER(TRIM(COALESCE(b.group_name, ''))) = LOWER($2::text)))
       ORDER BY b.created_at DESC`,
      [Number(groupId), groupName]
    );

    return res.json({ bookings: rows });
  } catch (error: any) {
    console.error('Error fetching group bookings:', error);
    return res.status(500).json({ error: 'Failed to fetch group bookings' });
  }
});

// GET consultation history logs for a group
router.get('/group/:groupId/logs', authenticate, async (req, res) => {
  try {
    const rawGroupId = String(req.params.groupId || '').trim();
    if (!rawGroupId) return res.status(400).json({ error: 'Missing group id.' });

    let groupName = '';

    const teamGroupRes = await pool.query(
      `SELECT name
       FROM team_groups
       WHERE CAST(id AS text) = $1
       LIMIT 1`,
      [rawGroupId]
    );

    if (teamGroupRes.rows.length > 0) {
      groupName = String(teamGroupRes.rows[0].name || '').trim();
    } else if (/^\d+$/.test(rawGroupId)) {
      const legacyGroupRes = await pool.query(
        `SELECT "groupName"
         FROM ss_group
         WHERE "smallgroupID" = $1
         LIMIT 1`,
        [Number(rawGroupId)]
      );
      groupName = String(legacyGroupRes.rows[0]?.groupName || '').trim();
    }

    if (!groupName) {
      return res.json({ logs: [] });
    }

    const { rows } = await pool.query(
      `SELECT
         c.*, 
         s.slot_date::text as slot_date,
         s.start_time,
         s.end_time,
         a."accountName" as adviser_name
       FROM ss_consultation c
       LEFT JOIN ss_consultation_slots s ON s.slot_id = c.slot_id
       LEFT JOIN ss_account a ON a.account_id = s.owner_account_id
       WHERE LOWER(TRIM(COALESCE(c."groupName", ''))) = LOWER($1)
       ORDER BY COALESCE(c.submitted_at, c.updated_at, c.created_at) DESC, c."conID" DESC`,
      [groupName]
    );

    return res.json({ logs: rows });
  } catch (error: any) {
    console.error('Error fetching consultation logs:', error);
    return res.status(500).json({ error: 'Failed to fetch consultation logs' });
  }
});

// POST create booking for a slot
router.post('/bookings', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const user: any = req.user;
    const requesterRole = String(user?.role || '').trim().toLowerCase();
    const { slotId, groupId, groupName, courseId } = req.body;
    const normalizedGroupName = String(groupName || '').trim();

    if (!slotId || !normalizedGroupName || !courseId) {
      return res.status(400).json({ error: 'Missing booking details.' });
    }

    // Resolve legacy numeric group id required by ss_consultation_bookings.group_id.
    // Accept numeric incoming IDs only if they actually exist; otherwise resolve by groupName.
    let numericGroupId: number | null = null;
    if (groupId !== undefined && groupId !== null && /^\d+$/.test(String(groupId))) {
      const candidate = Number(groupId);
      const exists = await client.query(
        'SELECT 1 FROM ss_group WHERE "smallgroupID" = $1 LIMIT 1',
        [candidate]
      );
      if (exists.rows.length > 0) {
        numericGroupId = candidate;
      }
    }

    if (!numericGroupId) {
      const upsertLegacy = await client.query(
        `INSERT INTO ss_group ("groupName", member1, "roleOne")
         VALUES ($1, $2, $3)
         ON CONFLICT ("groupName") DO UPDATE
         SET member1 = COALESCE(ss_group.member1, EXCLUDED.member1),
             "roleOne" = COALESCE(ss_group."roleOne", EXCLUDED."roleOne")
         RETURNING "smallgroupID"`,
        [normalizedGroupName, user.email || null, user.email || null]
      );
      numericGroupId = Number(upsertLegacy.rows[0].smallgroupID);
    }

    await client.query('BEGIN');

    const slotRes = await client.query(
      `SELECT
         s.slot_id,
         s.course_id,
         s.slot_type,
         s.max_groups,
         s.slot_date,
         s.end_time,
         sg."groupName" as reserved_group_name
       FROM ss_consultation_slots s
       LEFT JOIN ss_group sg ON sg."smallgroupID" = s.allowed_group_id
       WHERE s.slot_id = $1
       FOR UPDATE OF s`,
      [slotId]
    );

    if (slotRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Consultation slot not found.' });
    }

    const slot = slotRes.rows[0];
    if (Number(slot.course_id) !== Number(courseId)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Course mismatch for selected slot.' });
    }

    if (requesterRole === 'student') {
      const assignedAdvisers = await resolveStudentAssignedAdvisers(
        Number(courseId),
        String(user?.email || ''),
        normalizedGroupName
      );
      const assignedAdviserKeys = assignedAdvisers.adviserKeys;
      const assignedAdviserAccountIds = assignedAdvisers.adviserAccountIds;

      if (assignedAdviserKeys.length > 0 || assignedAdviserAccountIds.length > 0) {
        const slotOwnerRes = await client.query(
          `SELECT
             CAST(s.adviser_id AS text) AS adviser_id,
             LOWER(COALESCE(a."accountEmail", '')) AS owner_email,
             LOWER(COALESCE(a."accountName", '')) AS owner_name
           FROM ss_consultation_slots s
           LEFT JOIN ss_account a ON a.account_id = s.owner_account_id
           WHERE s.slot_id = $1
           LIMIT 1`,
          [slotId]
        );

        const ownerAdviserId = String(slotOwnerRes.rows[0]?.adviser_id || '').trim();
        const ownerEmail = String(slotOwnerRes.rows[0]?.owner_email || '').trim().toLowerCase();
        const ownerName = String(slotOwnerRes.rows[0]?.owner_name || '').trim().toLowerCase();
        const isAssignedOwner =
          (ownerAdviserId !== '' && assignedAdviserAccountIds.includes(ownerAdviserId)) ||
          assignedAdviserKeys.includes(ownerEmail) ||
          assignedAdviserKeys.includes(ownerName);

        if (!isAssignedOwner) {
          await client.query('ROLLBACK');
          return res.status(403).json({
            error: 'Your group can only book consultation slots from your assigned adviser.',
          });
        }
      }
    }

    const now = new Date();
    const rawSlotDate = slot.slot_date;
    const slotDate = (() => {
      if (rawSlotDate instanceof Date) return rawSlotDate.toISOString().slice(0, 10);
      const direct = String(rawSlotDate || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(direct)) return direct;
      const parsed = new Date(direct);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
      return '';
    })();

    if (!slotDate) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Invalid slot date format in database.' });
    }

    // Serialize booking attempts per legacy group id to avoid race-condition double inserts.
    await client.query(
      `SELECT pg_advisory_xact_lock($1::bigint)`,
      [numericGroupId]
    );

    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    if (slotDate < today || (slotDate === today && String(slot.end_time || '') <= currentTime)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This consultation slot has already ended.' });
    }

    if (String(slot.slot_type) === 'SPECIFIC_GROUP') {
      const reserved = String(slot.reserved_group_name || '').trim().toLowerCase();
      const requested = normalizedGroupName.toLowerCase();
      if (!reserved || reserved !== requested) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'This slot is reserved for a different group.' });
      }
    }

    const bookerEmail = String(user.email || '').trim();
    if (!bookerEmail) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Unable to determine booking user email from session.' });
    }

    const alreadyBooked = await client.query(
      `SELECT booking_id
       FROM ss_consultation_bookings
       WHERE slot_id = $1 AND group_id = $2 AND status = 'BOOKED'
       LIMIT 1`,
      [slotId, numericGroupId]
    );

    if (alreadyBooked.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Your group already booked this slot.' });
    }

    const weeklyOrSameDayBooking = await client.query(
      `SELECT b.booking_id,
              s_existing.slot_date::date as booked_date,
              s_target.slot_date::date as target_date
       FROM ss_consultation_bookings b
       JOIN ss_consultation_slots s_existing ON s_existing.slot_id = b.slot_id
       JOIN ss_consultation_slots s_target ON s_target.slot_id = $4
       WHERE (
         b.group_id = $1
         OR LOWER(TRIM(COALESCE(b.group_name, ''))) = LOWER($2)
         OR LOWER(TRIM(COALESCE(b.booked_by_email, ''))) = LOWER($3)
       )
         AND b.status = 'BOOKED'
         AND (
           s_existing.slot_date::date = s_target.slot_date::date
           OR date_trunc('week', s_existing.slot_date)::date = date_trunc('week', s_target.slot_date)::date
         )
       LIMIT 1`,
      [numericGroupId, normalizedGroupName, bookerEmail, slotId]
    );

    if (weeklyOrSameDayBooking.rows.length > 0) {
      const existingBookedDate = String(weeklyOrSameDayBooking.rows[0].booked_date || '').slice(0, 10);
      const targetBookedDate = String(weeklyOrSameDayBooking.rows[0].target_date || '').slice(0, 10);
      if (existingBookedDate !== '' && targetBookedDate !== '' && existingBookedDate === targetBookedDate) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Your group already has a booked consultation on this day.' });
      }
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Your group already has a booked consultation for this week.' });
    }

    // Also block rebooking when a consultation record already exists this day/week,
    // even if its original slot/booking row was deleted later.
    const consultationHistoryCheck = await client.query(
      `SELECT
         c."conID",
         CASE
           WHEN TRIM(COALESCE(c."conDate", '')) ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN TRIM(c."conDate")::date
           ELSE NULL
         END as consultation_date
       FROM ss_consultation c
       WHERE LOWER(TRIM(COALESCE(c."groupName", ''))) = LOWER($1)
         AND c.status IN ('SUBMITTED', 'COMPLETED')
         AND (
           CASE
             WHEN TRIM(COALESCE(c."conDate", '')) ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN TRIM(c."conDate")::date
             ELSE NULL
           END
         ) IS NOT NULL
         AND (
           (
             CASE
               WHEN TRIM(COALESCE(c."conDate", '')) ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN TRIM(c."conDate")::date
               ELSE NULL
             END
           ) = $2::date
           OR date_trunc('week', (
             CASE
               WHEN TRIM(COALESCE(c."conDate", '')) ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN TRIM(c."conDate")::date
               ELSE NULL
             END
           ))::date = date_trunc('week', $2::date)::date
         )
       LIMIT 1`,
      [normalizedGroupName, slotDate]
    );

    if (consultationHistoryCheck.rows.length > 0) {
      const consultationDate = String(consultationHistoryCheck.rows[0].consultation_date || '').slice(0, 10);
      if (consultationDate === slotDate) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Your group already completed a consultation record on this day.' });
      }
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Your group already completed a consultation record for this week.' });
    }

    const currentCountRes = await client.query(
      `SELECT COUNT(*)::int AS current_groups
       FROM ss_consultation_bookings
       WHERE slot_id = $1 AND status = 'BOOKED'`,
      [slotId]
    );

    const currentGroups = Number(currentCountRes.rows[0]?.current_groups || 0);
    if (currentGroups >= Number(slot.max_groups || 1)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'This slot is already full.' });
    }

    const insertRes = await client.query(
      `INSERT INTO ss_consultation_bookings (slot_id, course_id, group_id, group_name, booked_by_email, status)
       VALUES ($1, $2, $3, $4, $5, 'BOOKED')
       RETURNING *`,
      [slotId, courseId, numericGroupId, normalizedGroupName, bookerEmail]
    );

    await client.query('COMMIT');
    return res.json({ success: true, booking: insertRes.rows[0] });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error creating consultation booking:', error);
    const message = error?.detail || error?.message || 'Failed to create booking';
    return res.status(500).json({ error: message });
  } finally {
    client.release();
  }
});

// POST save consultation feedback from schedule modal
router.post('/feedback', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const user: any = req.user;
    const role = String(user?.role || '').toLowerCase();
    const canSubmit = role === 'adviser' || role === 'advisers' || role === 'admin';
    if (!canSubmit) {
      return res.status(403).json({ error: 'Only advisers/admins can submit consultation feedback.' });
    }

    const {
      booking_id,
      slot_id,
      group_name,
      conDate,
      conMil,
      conSum,
      conAction,
      conConcerns,
      adviser_notes,
      attendance_data,
      participation_data,
    } = req.body || {};

    if (!slot_id || !group_name || !conDate) {
      return res.status(400).json({ error: 'Missing required feedback fields.' });
    }

    await client.query('BEGIN');

    const bookingRes = await client.query(
      `SELECT booking_id, course_id, slot_id, group_name
       FROM ss_consultation_bookings
       WHERE ($1::int IS NULL OR booking_id = $1::int)
         AND slot_id = $2
         AND LOWER(TRIM(COALESCE(group_name, ''))) = LOWER($3)
       ORDER BY booking_id DESC
       LIMIT 1`,
      [booking_id ?? null, Number(slot_id), String(group_name || '').trim()]
    );

    if (bookingRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Matching booking was not found for this consultation feedback.' });
    }

    const booking = bookingRes.rows[0];

    const existingRes = await client.query(
      `SELECT "conID"
       FROM ss_consultation
       WHERE slot_id = $1
         AND LOWER(TRIM(COALESCE("groupName", ''))) = LOWER($2)
       ORDER BY "conID" DESC
       LIMIT 1`,
      [Number(slot_id), String(group_name || '').trim()]
    );

    let consultation: any;
    if (existingRes.rows.length > 0) {
      const conID = Number(existingRes.rows[0].conID);
      const updateRes = await client.query(
        `UPDATE ss_consultation
         SET "courseID" = $1,
             "groupName" = $2,
             slot_id = $3,
             "conDate" = $4,
             "conMil" = $5,
             "conSum" = $6,
             "conAction" = $7,
             "conConcerns" = $8,
             adviser_notes = $9,
             attendance_data = COALESCE($10::jsonb, '{}'::jsonb),
             participation_data = COALESCE($11::jsonb, '{}'::jsonb),
             status = 'SUBMITTED',
             submitted_at = NOW(),
             updated_at = NOW()
         WHERE "conID" = $12
         RETURNING *`,
        [
          Number(booking.course_id),
          String(group_name || '').trim(),
          Number(slot_id),
          String(conDate || '').slice(0, 10),
          String(conMil || ''),
          String(conSum || adviser_notes || ''),
          String(conAction || ''),
          String(conConcerns || ''),
          String(adviser_notes || ''),
          attendance_data ?? {},
          participation_data ?? {},
          conID,
        ]
      );
      consultation = updateRes.rows[0];
    } else {
      const insertRes = await client.query(
        `INSERT INTO ss_consultation
          ("courseID", "groupName", slot_id, "conDate", "conMil", "conSum", "conAction", "conConcerns", adviser_notes, attendance_data, participation_data, status, submitted_at)
         VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::jsonb, '{}'::jsonb), COALESCE($11::jsonb, '{}'::jsonb), 'SUBMITTED', NOW())
         RETURNING *`,
        [
          Number(booking.course_id),
          String(group_name || '').trim(),
          Number(slot_id),
          String(conDate || '').slice(0, 10),
          String(conMil || ''),
          String(conSum || adviser_notes || ''),
          String(conAction || ''),
          String(conConcerns || ''),
          String(adviser_notes || ''),
          attendance_data ?? {},
          participation_data ?? {},
        ]
      );
      consultation = insertRes.rows[0];
    }

    await client.query(
      `UPDATE ss_consultation_bookings
       SET consultation_id = $1,
           updated_at = NOW()
       WHERE booking_id = $2`,
      [consultation.conID, booking.booking_id]
    );

    const slotMetaRes = await client.query(
      `SELECT slot_id, adviser_id, slot_date::date as slot_date, max_groups
       FROM ss_consultation_slots
       WHERE slot_id = $1
       LIMIT 1`,
      [Number(slot_id)]
    );

    if (slotMetaRes.rows.length > 0) {
      const slotMeta = slotMetaRes.rows[0];
      const adviserId = Number(slotMeta.adviser_id);
      const slotDate = normalizeSlotDate(slotMeta.slot_date);
      const maxGroups = Number(slotMeta.max_groups || 1);

      if (!slotDate) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: 'Invalid slot date format while finalizing consultation feedback.' });
      }

      const slotProgressRes = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'BOOKED')::int as total_booked,
           COUNT(*) FILTER (WHERE status = 'BOOKED' AND consultation_id IS NOT NULL)::int as completed_booked
         FROM ss_consultation_bookings
         WHERE slot_id = $1`,
        [Number(slot_id)]
      );

      const totalBookedForSlot = Number(slotProgressRes.rows[0]?.total_booked || 0);
      const completedBookedForSlot = Number(slotProgressRes.rows[0]?.completed_booked || 0);

      // If this is a single-capacity slot (1/1), remove it after record submission.
      if (maxGroups <= 1 && completedBookedForSlot >= 1) {
        await client.query(
          `DELETE FROM ss_consultation_slots
           WHERE slot_id = $1 AND adviser_id = $2`,
          [Number(slot_id), adviserId]
        );
      }

      // Do not auto-delete all slots for a day after one feedback submission.
      // Keep remaining slots visible so advisers can continue managing the same date.
    }

    await client.query('COMMIT');

    try {
      await GoogleDocsService.archiveConsultation(
        {
          ...consultation,
          conID: consultation.conID,
          courseID: consultation.courseID,
          groupName: consultation.groupName,
          conDate: consultation.conDate,
          conMil: consultation.conMil,
          conSum: consultation.conSum,
          conAction: consultation.conAction,
          conStat: consultation.status || 'SUBMITTED',
        },
        String(user.email || '')
      );
    } catch (archiveErr: any) {
      console.warn('Consultation saved but Google Docs archive failed:', archiveErr?.message || archiveErr);
    }

    return res.json({ success: true, consultation });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error saving consultation feedback:', error);
    return res.status(500).json({ error: error?.message || 'Failed to save consultation feedback.' });
  } finally {
    client.release();
  }
});

export default router;
