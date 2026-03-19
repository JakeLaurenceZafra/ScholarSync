import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import 'dotenv/config';
import pg from 'pg';
import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { google } from 'googleapis';
import aiRoutes from './routes/ai.routes.js';
import { GoogleDocsService } from './googleDocsService.js';
import { authenticate, authorizeRole } from './middleware/auth.js';
import { pool } from './db.js';

const app = express();
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3002'],
  credentials: true
}));
app.use(express.json());

// Register ported ScholarSyncV3 routes
app.use('/api/ai', aiRoutes);

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
  callbackURL: "http://localhost:5000/auth/google/callback"
},
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      const name = profile.displayName;

      if (!email) {
        return done(new Error("No email found from Google profile"));
      }

      const { rows } = await pool.query('SELECT * FROM ss_account WHERE "accountEmail" = $1', [email]);
      const user = rows[0];

      if (!user) {
        return done(null, { isNew: true, email: email, accessToken } as any);
      }

      // Store / update access token for Google Drive/Sheets access
      await pool.query(
        'UPDATE ss_account SET "googleAccessToken" = $1 WHERE "accountEmail" = $2',
        [accessToken, email]
      );

      return done(null, { ...user, id: user.account_id, email: user.accountEmail, accessToken } as any);
    } catch (err) {
      return done(err as Error);
    }
  }
));

app.get('/auth/google',
  passport.authenticate('google', {
    scope: [
      'profile',
      'email',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ],
    accessType: 'offline',
    prompt: 'consent'
  } as any)
);

app.get('/auth/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${FRONTEND_URL}/login` }),
  (req, res) => {
    const user = req.user as any;

    if (user.isNew) {
      const tempToken = jwt.sign(
        { email: user.email, accessToken: user.accessToken, isRegistrationToken: true },
        process.env.JWT_SECRET || "test",
        { expiresIn: '15m' }
      );
      return res.redirect(`${FRONTEND_URL}/complete-profile?token=${tempToken}`);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.accountRole },
      process.env.JWT_SECRET || "test",
      { expiresIn: '24h' }
    );

    res.redirect(`${FRONTEND_URL}/auth-success?token=${token}`);
  }
);

app.post('/api/complete-profile', async (req, res) => {
  const { token, name } = req.body;
  if (!token || !name) return res.status(400).json({ error: "Missing token or name" });

  try {
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET || "test");
    if (!decoded.isRegistrationToken || !decoded.email) {
      return res.status(400).json({ error: "Invalid registration token" });
    }

    const email = decoded.email;
    const accessToken = decoded.accessToken;

    const insertRes = await pool.query(
      `INSERT INTO ss_account ("accountName", "accountEmail", "accountRole", "googleAccessToken") 
       VALUES ($1, $2, 'Student', $3) RETURNING *`,
      [name, email, accessToken]
    );
    const newUser = insertRes.rows[0];

    const sessionToken = jwt.sign(
      { id: newUser.account_id, email: newUser.accountEmail, role: newUser.accountRole },
      process.env.JWT_SECRET || "test",
      { expiresIn: '24h' }
    );

    res.json({ token: sessionToken, user: newUser });
  } catch (error: any) {
    return res.status(401).json({ error: "Token expired or invalid" });
  }
});

const verifyAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "test", (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    if (user.role !== 'Admin') return res.status(403).json({ error: "Admin access required" });
    (req as any).user = user;
    next();
  });
};

app.get('/api/accounts', verifyAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT account_id, "accountName", "accountEmail", "accountRole" FROM ss_account ORDER BY "accountName"');
    res.json(rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/accounts/:id/role', verifyAdmin, async (req, res) => {
  const accountId = req.params.id;
  const { role } = req.body;
  if (!role) return res.status(400).json({ error: "Missing role" });

  try {
    const { rows } = await pool.query(
      'UPDATE ss_account SET "accountRole" = $1 WHERE account_id = $2 RETURNING *',
      [role, accountId]
    );
    res.json(rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/accounts/:id', verifyAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM ss_account WHERE account_id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const verifyInstructor = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "test", (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    if (user.role !== 'Admin' && user.role !== 'Adviser') {
      return res.status(403).json({ error: "Instructor access required" });
    }
    (req as any).user = user;
    next();
  });
};

app.get('/api/courses', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    const user: any = jwt.verify(token, process.env.JWT_SECRET || "test");

    const enrollRes = await pool.query('SELECT course_id FROM ss_enrollments WHERE account_id = $1', [user.id]);
    const enrolledCourseIds = enrollRes.rows.map(e => e.course_id);

    if (user.role === 'Admin' || user.role === 'Adviser') {
      // Admin/Adviser see ALL courses
      const { rows: allCourses } = await pool.query('SELECT * FROM ss_courses ORDER BY id DESC');
      return res.json(allCourses);
    }

    if (user.role === 'Student') {
      if (enrolledCourseIds.length === 0) return res.json([]);
      const { rows } = await pool.query('SELECT * FROM ss_courses WHERE id = ANY($1::int[]) ORDER BY id DESC', [enrolledCourseIds]);
      return res.json(rows);
    }

    return res.json([]);
  } catch (err) {
    return res.sendStatus(403);
  }
});

app.get('/api/courses/:id', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || "test");
    const { rows } = await pool.query('SELECT * FROM ss_courses WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Course not found" });
    return res.json(rows[0]);
  } catch (err) {
    return res.sendStatus(403);
  }
});

// Get groups for a specific course
app.get('/api/courses/:id/groups', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || "test");
    // Query groups from team_groups table
    const { rows: groups } = await pool.query(
      `SELECT id as id, name as group_name, team_number
       FROM team_groups 
       WHERE course_id = $1
       ORDER BY team_number ASC NULLS LAST, name ASC`,
      [req.params.id]
    );
    
    console.log('Groups from team_groups table for course', req.params.id, ':', groups);
    return res.json({ groups });
  } catch (err) {
    console.error('Error fetching groups:', err);
    return res.status(500).json({ error: 'Failed to fetch groups', details: (err as any).message });
  }
});

// Debug endpoint to see raw team_groups data
app.get('/api/debug/groups', async (req, res) => {
  try {
    const { rows: allGroups } = await pool.query(
      `SELECT id, name, course_id, team_number FROM team_groups ORDER BY name`
    );
    const { rows: counts } = await pool.query('SELECT COUNT(*) as count FROM team_groups');
    return res.json({ 
      totalCount: counts[0].count,
      groups: allGroups 
    });
  } catch (err) {
    return res.status(500).json({ error: (err as any).message });
  }
});

app.get('/api/courses/:id/members', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || "test");
    const enrollRes = await pool.query('SELECT account_id FROM ss_enrollments WHERE course_id = $1', [req.params.id]);
    const accountIds = enrollRes.rows.map(e => e.account_id);

    if (accountIds.length === 0) return res.json([]);

    const actRes = await pool.query(
      'SELECT account_id as id, "accountName", "accountEmail", "accountRole" FROM ss_account WHERE account_id = ANY($1::int[])',
      [accountIds]
    );

    // Map account_id back to id for the frontend
    const formatted = actRes.rows.map(r => ({ ...r, id: r.id, account_id: r.id }));
    return res.json(formatted);
  } catch (err) {
    return res.sendStatus(403);
  }
});
// ── Team Group Comments (shared with SkyFlow's Discussion) ──
app.get('/api/team-groups/:id/comments', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || "test");
    const { rows } = await pool.query(
      `SELECT id, user_name, content, created_at FROM team_comments
       WHERE team_group_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );
    return res.json(rows);
  } catch (err) {
    return res.sendStatus(403);
  }
});

app.post('/api/team-groups/:id/comments', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "test") as any;
    const { content } = req.body;
    if (!content || !content.trim()) return res.status(400).json({ error: 'Comment cannot be empty' });

    // Get user name from ss_account
    const userResult = await pool.query(
      'SELECT "accountName", "accountEmail" FROM ss_account WHERE account_id = $1',
      [decoded.id]
    );
    const userName = userResult.rows[0]?.accountName || decoded.email || 'Unknown';

    const { rows } = await pool.query(
      `INSERT INTO team_comments (team_group_id, user_id, user_name, content)
       VALUES ($1, $2, $3, $4) RETURNING id, user_name, content, created_at`,
      [req.params.id, null, userName, content.trim()]
    );
    return res.json(rows[0]);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET course members (enrolled students) ──
app.get('/api/courses/:id/members', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || 'test');
    const { rows } = await pool.query(
      `SELECT a.account_id, a."accountName", a."accountEmail", a."accountRole"
       FROM ss_account a
       JOIN ss_enrollments e ON e.account_id = a.account_id
       WHERE e.course_id = $1
       ORDER BY a."accountName"`,
      [req.params.id]
    );
    return res.json(rows);
  } catch (err) {
    return res.sendStatus(403);
  }
});

// ── GET course consultations ──
app.get('/api/courses/:id/consultations', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || 'test');
    
    const { rows } = await pool.query(
      `SELECT "conID", "courseID", "groupName", "conDate", "conType", "conMil",
              "conSum", "conAction", "conAtt", "isDraft", "conStat", "conNotes"
       FROM ss_consultation
       WHERE "courseID" = $1
       ORDER BY "conDate" DESC`,
      [req.params.id]
    );
    return res.json(rows);
  } catch (err) {
    return res.json([]); // Graceful fallback
  }
});

app.post('/api/consultations', authenticate, authorizeRole(['Adviser', 'Admin', 'Student']), async (req, res) => {
  const { courseID, groupName, conDate, conMil, conSum, conAction, conConcerns, isDraft, conNotes, conAtt } = req.body;
  
  try {
    // Map to new consolidated columns
    const status = isDraft ? 'DRAFT' : 'SUBMITTED';
    const adviser_notes = conNotes || null;
    const attendance_data = conAtt ? { legacy_conAtt: conAtt } : {};

    const { rows } = await pool.query(
      `INSERT INTO ss_consultation 
       ("courseID", "groupName", "conDate", "conMil", "conSum", "conAction", "conConcerns", status, adviser_notes, attendance_data, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING *`,
      [courseID, groupName, conDate, conMil, conSum, conAction, conConcerns || null, status, adviser_notes, JSON.stringify(attendance_data)]
    );
    
    const data = rows[0];
    
    // Archive to Google Docs if not a draft (using new status column)
    if (data && status === 'SUBMITTED') {
      try {
        await GoogleDocsService.archiveConsultation(data, (req as any).user.email);
      } catch (archiveError) {
        console.error("Archive failed:", archiveError);
      }
    }
    
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/consultations/:id', authenticate, authorizeRole(['Adviser', 'Admin']), async (req, res) => {
  const { conDate, conMil, conSum, conAction, conConcerns, isDraft, conNotes, conAtt } = req.body;
  const conID = req.params.id;

  try {
    // Map to new consolidated columns
    const status = isDraft ? 'DRAFT' : 'SUBMITTED';
    const adviser_notes = conNotes || null;
    const attendance_data = conAtt ? { legacy_conAtt: conAtt } : {};

    const { rows } = await pool.query(
      `UPDATE ss_consultation 
       SET "conDate" = $1, "conMil" = $2, "conSum" = $3, "conAction" = $4, "conConcerns" = $5, status = $6, adviser_notes = $7, attendance_data = $8, updated_at = NOW()
       WHERE "conID" = $9
       RETURNING *`,
      [conDate, conMil, conSum, conAction, conConcerns || null, status, adviser_notes, JSON.stringify(attendance_data), conID]
    );
    
    const data = rows[0];

    if (data && status === 'SUBMITTED') {
      try {
        await GoogleDocsService.archiveConsultation(data, (req as any).user.email);
      } catch (archiveError) {
        console.error("Archive failed:", archiveError);
      }
    }
    
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/courses/:id/groupings', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || "test");
    const { rows } = await pool.query(
      `SELECT id, name as "groupName", team_number, adviser_name as adviser, proposed_project, 
              consultation_dates, comments, grade, course_id as "courseID"
       FROM team_groups WHERE course_id = $1 ORDER BY team_number`,
      [req.params.id]
    );
    return res.json(rows);
  } catch (err) {
    return res.sendStatus(403);
  }
});

// Returns groupings WITH embedded members for a course
app.get('/api/courses/:id/group-members', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || "test");
    const { rows: groups } = await pool.query(
      `SELECT id, name as "groupName", team_number, adviser_name as adviser, proposed_project,
              consultation_dates, comments, grade, course_id as "courseID"
       FROM team_groups WHERE course_id = $1 ORDER BY team_number`,
      [req.params.id]
    );

    // Fetch members for each group
    const enriched = await Promise.all(groups.map(async (g: any) => {
      const { rows: members } = await pool.query(
        `SELECT member_number, name, email, is_leader FROM team_group_members
         WHERE team_group_id = $1 ORDER BY member_number`,
        [g.id]
      );
      return {
        ...g,
        groupMembers: members.length,
        members,
      };
    }));

    return res.json(enriched);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET specific group by ID ──
app.get('/api/groups/:id', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || 'test');
    
    // Fetch group details
    const { rows: groups } = await pool.query(
      `SELECT id as "groupID", name as "groupName", team_number, adviser_name as adviser, proposed_project,
              consultation_dates, comments, grade, course_id as "courseID"
       FROM team_groups WHERE id = $1`,
      [req.params.id]
    );

    if (groups.length === 0) return res.status(404).json({ error: "Group not found" });
    const group = groups[0];

    // Fetch members explicitly spreading to member1...member5 for legacy UI support
    const { rows: members } = await pool.query(
         `SELECT member_number, name, email, is_leader FROM team_group_members
          WHERE team_group_id = $1 ORDER BY member_number`,
         [req.params.id]
    );

    const groupData: any = {
      ...group,
      id: group.groupID,
      member1: members[0]?.email || null,
      roleOne: members[0]?.is_leader ? 'leader' : (members[0] ? 'member' : null),
      nameOne: members[0]?.name || null,
      member2: members[1]?.email || null,
      roleTwo: members[1]?.is_leader ? 'leader' : (members[1] ? 'member' : null),
      nameTwo: members[1]?.name || null,
      member3: members[2]?.email || null,
      roleThree: members[2]?.is_leader ? 'leader' : (members[2] ? 'member' : null),
      nameThree: members[2]?.name || null,
      member4: members[3]?.email || null,
      roleFour: members[3]?.is_leader ? 'leader' : (members[3] ? 'member' : null),
      nameFour: members[3]?.name || null,
      member5: members[4]?.email || null,
      roleFive: members[4]?.is_leader ? 'leader' : (members[4] ? 'member' : null),
      nameFive: members[4]?.name || null,
    };

    return res.json(groupData);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ── GET group tasks (dummy endpoint to prevent 404 until implemented) ──
app.get('/api/groups/:id/tasks', async (req, res) => {
  return res.json([]);
});

// ── GET member journals for a course group ──
app.get('/api/member-journals/course/:courseId/group/:groupId', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || 'test');

    const { courseId, groupId } = req.params;
    const groupRes = await pool.query(
      'SELECT name FROM team_groups WHERE id = $1 AND course_id = $2',
      [groupId, Number(courseId)]
    );

    if (groupRes.rows.length === 0) {
      return res.json({ journals: [] });
    }

    const groupName = groupRes.rows[0].name;

    const { rows } = await pool.query(
      `SELECT id, "courseID", "groupName", member_email, journal_date, task_updates, action_plans, issues,
              minutes_date, minutes_adviser, minutes_key_points, minutes_action_items, minutes_action_deadlines,
              next_consultation
       FROM ss_member_journals
       WHERE "courseID" = $1
         AND lower(trim("groupName")) = lower(trim($2))
       ORDER BY journal_date DESC, id DESC`,
      [Number(courseId), groupName]
    );

    return res.json({ journals: rows });
  } catch (err: any) {
    console.error('Error fetching member journals:', err.message);
    return res.status(500).json({ error: 'Failed to fetch member journals.' });
  }
});

// ── POST member journal entry ──
app.post('/api/member-journals', authenticate, authorizeRole(['Student', 'Adviser', 'Admin']), async (req, res) => {
  const {
    courseID,
    groupID,
    member_email,
    journal_date,
    task_updates,
    action_plans,
    issues,
    minutes_date,
    minutes_adviser,
    minutes_key_points,
    minutes_action_items,
    minutes_action_deadlines,
    next_consultation,
  } = req.body;

  if (!courseID || !groupID || !member_email || !journal_date) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    const requester = (req as any).user;
    const requesterEmail = String(requester?.email || '').trim().toLowerCase();
    const targetEmail = String(member_email || '').trim().toLowerCase();

    if (requester?.role === 'Student' && requesterEmail !== targetEmail) {
      return res.status(403).json({ error: 'Students can only create journals for their own folder.' });
    }

    const groupRes = await pool.query(
      'SELECT name, course_id FROM team_groups WHERE id = $1',
      [groupID]
    );
    if (groupRes.rows.length === 0) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    const group = groupRes.rows[0];
    if (Number(group.course_id) !== Number(courseID)) {
      return res.status(400).json({ error: 'Group does not belong to this course.' });
    }

    const membershipRes = await pool.query(
      `SELECT 1
       FROM team_group_members
       WHERE team_group_id = $1
         AND lower(trim(email)) = lower(trim($2))
       LIMIT 1`,
      [groupID, targetEmail]
    );

    if (membershipRes.rows.length === 0) {
      return res.status(400).json({ error: 'Member does not belong to this group.' });
    }

    const normalizeArray = (value: any): string[] => {
      if (Array.isArray(value)) {
        return value.map((v) => String(v || '').trim()).filter(Boolean);
      }
      return [];
    };

    const safeTaskUpdates = normalizeArray(task_updates);
    const safeActionPlans = normalizeArray(action_plans);
    const safeIssues = normalizeArray(issues);

    const { rows } = await pool.query(
      `INSERT INTO ss_member_journals
        ("courseID", "groupName", member_email, journal_date, task_updates, action_plans, issues,
         minutes_date, minutes_adviser, minutes_key_points, minutes_action_items, minutes_action_deadlines,
         next_consultation)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12, $13)
       RETURNING id, "courseID", "groupName", member_email, journal_date, task_updates, action_plans, issues,
                 minutes_date, minutes_adviser, minutes_key_points, minutes_action_items, minutes_action_deadlines,
                 next_consultation`,
      [
        Number(courseID),
        group.name,
        targetEmail,
        journal_date,
        JSON.stringify(safeTaskUpdates),
        JSON.stringify(safeActionPlans),
        JSON.stringify(safeIssues),
        minutes_date || null,
        minutes_adviser ? String(minutes_adviser).trim() : null,
        minutes_key_points ? String(minutes_key_points).trim() : null,
        minutes_action_items ? String(minutes_action_items).trim() : null,
        minutes_action_deadlines ? String(minutes_action_deadlines).trim() : null,
        next_consultation || null,
      ]
    );

    return res.json(rows[0]);
  } catch (err: any) {
    console.error('Error creating member journal:', err.message);
    return res.status(500).json({ error: 'Failed to create member journal.' });
  }
});

// ================================================================
// SMART IMPORT: Auto-detect course from TEAM CODE column
// Format: 2526-sem1-it332-01
//   2526  = academic year (2025-2026)
//   sem1  = semester
//   it332 = course code
//   01    = group number
// ================================================================

function parseTeamCode(teamCode: string) {
  const clean = teamCode.trim().toLowerCase();
  const parts = clean.split('-');
  if (parts.length < 4) return null;

  const yearPart = parts[0] ?? '';
  const semPart = parts[1] ?? '';
  const codePart = parts[2] ?? '';
  const groupPart = parts.slice(3).join('-');

  if (!yearPart.match(/^\d{4}$/) || !semPart.startsWith('sem') || !codePart) return null;

  const y1 = `20${yearPart.slice(0, 2)}`;
  const y2 = `20${yearPart.slice(2, 4)}`;
  const academicYear = `${y1}-${y2}`;
  const semNum = semPart.replace('sem', '');
  const semester = semNum === '1' ? '1st Semester' : semNum === '2' ? '2nd Semester' : `Semester ${semNum}`;
  const courseCode = codePart.toUpperCase();
  const groupNum = parseInt(groupPart, 10) || groupPart;
  const groupName = `Group ${groupNum}`;
  const courseKeyBase = `${yearPart}${semPart}${codePart}`;

  return {
    courseCode,
    courseName: `${courseCode} — ${semester} ${academicYear}`,
    courseTerm: `${semester} ${academicYear}`,
    courseKey: courseKeyBase.substring(0, 20),
    groupName,
    groupPart,
  };
}

app.post('/api/import-from-sheet', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  let user: any;
  try {
    user = (jwt.verify(token, process.env.JWT_SECRET || 'test') as any);
  } catch {
    return res.sendStatus(403);
  }

  const { sheetId } = req.body;
  if (!sheetId) return res.status(400).json({ error: 'Missing sheetId' });

  try {
    const accessToken = await getAccessToken(token);
    let records: any[] = [];
    let sheetTitle = 'Imported Sheet';

    // Helper: find the actual header row (scans until it finds a row with a cell === 'TEAM CODE')
    const findHeaderRow = (rows: string[][]): { headers: string[]; dataRows: string[][] } | null => {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] ?? [];
        const hasTeamCode = row.some(cell => cell.toString().trim().toUpperCase() === 'TEAM CODE');
        if (hasTeamCode) {
          return {
            headers: row.map(h => h.toString().trim()),
            dataRows: rows.slice(i + 1)
          };
        }
      }
      return null;
    };

    // Try Google Sheets API first (private sheets)
    if (accessToken) {
      try {
        const metaRes = await axios.get(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        sheetTitle = metaRes.data?.properties?.title || sheetTitle;

        const dataRes = await axios.get(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:Z1000`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const values: string[][] = dataRes.data.values || [];
        const found = findHeaderRow(values);
        if (found && found.dataRows.length > 0) {
          records = found.dataRows
            .filter(row => row.some(cell => cell.toString().trim() !== '')) // skip blank rows
            .map(row => {
              const obj: any = {};
              found.headers.forEach((h, i) => { obj[h] = (row[i] ?? '').toString().trim(); });
              return obj;
            });
        }
      } catch (e: any) {
        console.log('Sheets API failed, falling back to CSV:', e.message);
      }
    }

    // Fallback: public CSV — parse raw lines to find TEAM CODE header row
    if (records.length === 0) {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      const response = await axios.get(csvUrl);
      // Parse without column headers to get raw rows
      const rawRows: string[][] = parse(response.data, { columns: false, skip_empty_lines: false, relax_column_count: true });
      const found = findHeaderRow(rawRows);
      if (found && found.dataRows.length > 0) {
        records = found.dataRows
          .filter(row => row.some(cell => cell.toString().trim() !== ''))
          .map(row => {
            const obj: any = {};
            found.headers.forEach((h, i) => { obj[h] = (row[i] ?? '').toString().trim(); });
            return obj;
          });
      } else {
        // Fallback: original behaviour (treat first row as headers)
        records = parse(response.data, { columns: true, skip_empty_lines: true });
      }
    }

    if (records.length === 0) {
      return res.status(400).json({ error: 'Sheet is empty or inaccessible.' });
    }

    // Case-insensitive column finder with partial matching
    // e.g. 'email' matches column 'EMAIL @cit.edu'
    const findCol = (row: any, ...names: string[]) => {
      for (const name of names) {
        const nameLow = name.toLowerCase();
        // Exact match
        let key = Object.keys(row).find(k => k.trim().toLowerCase() === nameLow);
        if (!key) {
          // Partial match — the column header contains the search name
          key = Object.keys(row).find(k => k.trim().toLowerCase().includes(nameLow));
        }
        if (key !== undefined && row[key]) return row[key].toString().trim();
      }
      return '';
    };

    // Group rows by team code
    // Structure: { courseKeyBase: { parsed, groups map with members + metadata } }
    const courseMap: Record<string, {
      parsed: ReturnType<typeof parseTeamCode>;
      groups: Record<string, { members: { email: string; fullName: string; memberNum: number }[]; adviser: string; proposedProject: string }>;
    }> = {};

    for (const row of records) {
      const teamCode = findCol(row, 'TEAM CODE', 'Team Code', 'teamcode', 'group', 'Group', 'GROUP');
      const email = findCol(row, 'EMAIL', 'Email', 'email');
      const fullName = findCol(row, 'FIRSTNAME', 'First Name', 'Full name', 'Full Name', 'Name', 'LASTNAME', 'Lastname');
      const lastName = findCol(row, 'LASTNAME', 'Lastname', 'Last Name');
      const firstName = findCol(row, 'FIRSTNAME', 'Firstname', 'First Name');
      const memberNum = parseInt(findCol(row, 'MEMBER #', 'Member #', 'member', 'Member') || '0', 10);
      const adviser = findCol(row, 'ADVISER', 'Adviser', 'advisor', 'Advisor');
      const proposedProject = findCol(row, 'PROPOSED PROJECT', 'Proposed Project', 'Project', 'project');

      if (!teamCode || !email) continue;

      const parsed = parseTeamCode(teamCode);
      if (!parsed) continue;

      const key = parsed.courseKey;
      if (!courseMap[key]) {
        courseMap[key] = { parsed, groups: {} };
      }

      const displayName = fullName || (firstName && lastName ? `${firstName} ${lastName}` : email.split('@')[0]);

      const currentCourse = courseMap[key]!;
      if (!currentCourse.groups[parsed.groupName]) {
        currentCourse.groups[parsed.groupName] = { members: [], adviser: '', proposedProject: '' };
      }
      
      const currentGroup = currentCourse.groups[parsed.groupName]!;
      currentGroup.members.push({ 
        email, 
        fullName: displayName, 
        memberNum: memberNum || (currentGroup.members.length + 1) 
      });

      if (adviser) currentGroup.adviser = adviser;
      if (proposedProject) currentGroup.proposedProject = proposedProject;
    }
    const forceReplace = req.body.forceReplace === true;

    if (Object.keys(courseMap).length === 0) {
      return res.status(400).json({
        error: 'No valid TEAM CODE rows found. Expected format: 2526-sem1-it332-01'
      });
    }

    const client = await pool.connect();
    const results: any[] = [];

    try {
      await client.query('BEGIN');

      // Pre-check: detect existing teams for each course
      if (!forceReplace) {
        const existingConflicts: any[] = [];
        for (const [courseKey, { parsed }] of Object.entries(courseMap)) {
          if (!parsed) continue;
          const existingCourse = await client.query(
            'SELECT id FROM ss_courses WHERE "courseKey" = $1 OR "courseKey" LIKE $1 || \'-%\' LIMIT 1',
            [parsed.courseKey]
          );
          if (existingCourse.rows.length > 0) {
            const courseId = existingCourse.rows[0].id;
            const existingTeams = await client.query(
              'SELECT COUNT(*) as count FROM team_groups WHERE course_id = $1',
              [courseId]
            );
            const teamCount = parseInt(existingTeams.rows[0].count);
            if (teamCount > 0) {
              existingConflicts.push({
                courseKey: parsed.courseKey,
                courseCode: parsed.courseCode,
                courseName: parsed.courseName,
                courseTerm: parsed.courseTerm,
                existingTeamCount: teamCount,
              });
            }
          }
        }

        if (existingConflicts.length > 0) {
          await client.query('ROLLBACK');
          client.release();
          return res.status(409).json({
            conflict: true,
            message: `Teams for ${existingConflicts.map(c => c.courseCode).join(', ')} already exist in SkyFlow.`,
            existingCourses: existingConflicts,
            hint: 'Set forceReplace: true to replace existing data, or check SkyFlow for your teams.',
          });
        }
      }

      for (const [courseKey, { parsed, groups }] of Object.entries(courseMap)) {
        if (!parsed) continue;

        // 1. Find or create the course
        const existingCourse = await client.query(
          'SELECT id FROM ss_courses WHERE "courseKey" = $1 OR "courseKey" LIKE $1 || \'-%\' LIMIT 1',
          [parsed.courseKey]
        );

        let courseId: number;
        if (existingCourse.rows.length > 0) {
          courseId = existingCourse.rows[0].id;
        } else {
          // Generate a unique key to avoid collisions
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          const suffix = Array.from({ length: 4 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');
          const uniqueKey = `${parsed.courseKey.substring(0, 16)}-${suffix}`;

          const newCourse = await client.query(
            `INSERT INTO ss_courses ("courseName", "courseCode", "courseSection", "courseTerm", "courseKey", "courseAmount", "courseAdviser")
             VALUES ($1, $2, '', $3, $4, 0, $5) RETURNING id`,
            [parsed.courseName, parsed.courseCode, parsed.courseTerm, uniqueKey, user.email || null]
          );
          courseId = newCourse.rows[0].id;
        }

        // 2. Get the ScholarSync organization for team_groups
        let orgResult = await client.query("SELECT id FROM organizations WHERE name = 'ScholarSync' LIMIT 1");
        if (orgResult.rows.length === 0) {
          orgResult = await client.query(
            `INSERT INTO organizations (name, description, domain)
             VALUES ('ScholarSync', 'Academic collaboration workspace synced from ScholarSync', 'scholarsync.local')
             RETURNING id`
          );
        }
        const orgId = orgResult.rows[0]?.id;

        // 3. Ensure the user exists in SkyFlow's users table and ScholarSync organization
        const accountRes = await client.query('SELECT account_id, "accountName", "accountEmail", "accountRole" FROM ss_account WHERE "accountEmail" = $1', [user.email]);
        const account = accountRes.rows[0];

        if (account) {
          // Attempt to get the real google_id using the accessToken if possible
          let googleId = account.accountEmail; // fallback
          if (accessToken) {
            try {
              const profileRes = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` }
              });
              if (profileRes.data?.id) googleId = profileRes.data.id;
            } catch (err) {
              console.log('Failed to fetch google_id from userinfo:', (err as any).message);
            }
          }

          // Upsert into SkyFlow users table
          const skyUserRes = await client.query(
            `INSERT INTO users (google_id, email, name, created_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (google_id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
             RETURNING id`,
            [googleId, account.accountEmail, account.accountName]
          );
          const skyUserId = skyUserRes.rows[0].id;

          // Now add to organization
          await client.query(
            `INSERT INTO organization_members (organization_id, user_id, role, status, joined_at)
             VALUES ($1, $2, 'admin', 'active', NOW())
             ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'admin', status = 'active'`,
            [orgId, skyUserId]
          );
        }

        // 4. Clear old team_groups for this course (only reached if forceReplace or no conflict)
        const oldTeams = await client.query('SELECT id FROM team_groups WHERE course_id = $1', [courseId]);
        for (const t of oldTeams.rows) {
          await client.query('DELETE FROM team_group_members WHERE team_group_id = $1', [t.id]);
        }
        await client.query('DELETE FROM team_groups WHERE course_id = $1', [courseId]);

        // 4. Insert new groups into team_groups + team_group_members
        // Get the current highest team_number in the org to avoid unique constraint violations
        const maxNumRes = await client.query(
          'SELECT COALESCE(MAX(team_number), 0) as max_num FROM team_groups WHERE organization_id = $1',
          [orgId]
        );
        let teamNumber = parseInt(maxNumRes.rows[0].max_num) + 1;

        for (const [groupName, groupData] of Object.entries(groups)) {
          // Optional: Find adviser_id if they exist in users table
          let adviserId = null;
          if (groupData.adviser && groupData.adviser.includes('@')) {
            const advRes = await client.query('SELECT id FROM users WHERE email = $1', [groupData.adviser.toLowerCase().trim()]);
            if (advRes.rows.length > 0) adviserId = advRes.rows[0].id;
          }

          const teamRes = await client.query(
            `INSERT INTO team_groups (organization_id, team_code, team_number, name, description, adviser_name, adviser_id, course_id, proposed_project, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active') RETURNING id`,
            [
              orgId,
              parsed.courseKey,
              teamNumber,
              groupName,
              `${parsed.courseName} | ${parsed.courseTerm}`,
              groupData.adviser || null,
              adviserId,
              courseId,
              groupData.proposedProject || null,
            ]
          );
          const teamId = teamRes.rows[0].id;

          // Insert members into team_group_members
          let memberNum = 1;
          for (const member of groupData.members) {
            await client.query(
              `INSERT INTO team_group_members (team_group_id, member_number, name, email, is_leader)
               VALUES ($1, $2, $3, $4, $5)`,
              [teamId, member.memberNum || memberNum, member.fullName, member.email, (member.memberNum || memberNum) === 1]
            );
            memberNum++;
          }

          // Update accountGroup for each member
          for (const { email } of groupData.members) {
            await client.query(
              'UPDATE ss_account SET "accountGroup" = $1 WHERE "accountEmail" = $2',
              [groupName, email]
            );
          }

          teamNumber++;
        }

        // 5. Save to connected sheets
        await client.query(
          `INSERT INTO ss_connected_sheets ("courseID", "sheetId", "sheetName", "groupCount")
           VALUES ($1, $2, $3, $4)
           ON CONFLICT ("courseID", "sheetId") DO UPDATE SET "sheetName" = $3, "groupCount" = $4`,
          [courseId, sheetId, sheetTitle, Object.keys(groups).length]
        );

        results.push({
          courseCode: parsed.courseCode,
          courseName: parsed.courseName,
          courseId,
          groupCount: Object.keys(groups).length,
          memberCount: Object.values(groups).reduce((s, g) => s + g.members.length, 0),
        });
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const totalGroups = results.reduce((s, r) => s + r.groupCount, 0);
    const totalMembers = results.reduce((s, r) => s + r.memberCount, 0);

    return res.json({
      success: true,
      message: `Imported ${totalGroups} groups across ${results.length} course(s) from "${sheetTitle}" — ${totalMembers} members synced!`,
      courses: results,
      sheetTitle,
    });

  } catch (error: any) {
    if (error?.response?.status === 403 || error?.response?.status === 404) {
      return res.status(400).json({ error: "Cannot access sheet. Make sure it's shared with 'Anyone with the link'." });
    }
    return res.status(500).json({ error: error?.message || 'Import failed.' });
  }
});

app.post('/api/courses/:id/import-groups', async (req, res) => {
  const { sheetUrl, sheetId: directSheetId } = req.body;
  const courseId = req.params.id;

  if (!sheetUrl && !directSheetId) return res.status(400).json({ error: "Missing Google Sheets URL or ID" });

  try {
    // Extract sheet ID from URL or use direct ID
    let sheetId: string;
    if (directSheetId) {
      sheetId = directSheetId;
    } else {
      const match = sheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (!match?.[1]) return res.status(400).json({ error: "Invalid Google Sheets link." });
      sheetId = match[1];
    }

    // Get user's Google access token to read private sheets
    const authHeader = req.headers.authorization;
    const jwtToken = authHeader && authHeader.split(' ')[1];
    const accessToken = jwtToken ? await getAccessToken(jwtToken) : null;

    let records: any[] = [];
    let sheetTitle = 'Imported Sheet';

    // Try Sheets API first (works for private sheets the user owns)
    if (accessToken) {
      try {
        const metaRes = await axios.get(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        sheetTitle = metaRes.data?.properties?.title || sheetTitle;

        const dataRes = await axios.get(
          `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/A1:Z1000`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const values: string[][] = dataRes.data.values || [];
        if (values && values.length > 0) {
          const headers = (values[0] || []).map((h: string) => h.trim());
          records = values.slice(1).map((row: string[]) => {
            const obj: any = {};
            headers.forEach((h, i) => { obj[h] = (row[i] || '').trim(); });
            return obj;
          });
        }
      } catch (sheetsErr: any) {
        console.log('Sheets API failed, trying public CSV:', sheetsErr.message);
      }
    }

    // Fallback to public CSV export
    if (records.length === 0) {
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      const response = await axios.get(csvUrl);
      records = parse(response.data, { columns: true, skip_empty_lines: true });
    }

    if (records.length === 0) {
      return res.status(400).json({ error: "Sheet appears to be empty or inaccessible." });
    }

    // Normalise column names (case-insensitive lookup)
    const findCol = (row: any, ...names: string[]) => {
      for (const name of names) {
        const key = Object.keys(row).find(k => k.trim().toLowerCase() === name.toLowerCase());
        if (key && row[key]) return row[key].trim();
      }
      return '';
    };

    const groupCounts: { [key: string]: number } = {};
    const emailsToUpdate: { email: string; groupName: string; fullName: string }[] = [];

    for (const row of records) {
      const email = findCol(row, 'Email', 'EMAIL', 'email');
      const groupName = findCol(row, 'group', 'Group', 'GROUP', 'TEAM CODE', 'Team Code', 'teamcode');
      const fullName = findCol(row, 'Full name', 'Full Name', 'FULLNAME', 'Name', 'name', 'LASTNAME');

      if (email && groupName) {
        groupCounts[groupName] = (groupCounts[groupName] || 0) + 1;
        emailsToUpdate.push({ email, groupName, fullName: fullName || email.split('@')[0] });
      }
    }

    if (Object.keys(groupCounts).length === 0) {
      return res.status(400).json({
        error: "No valid groups found. Sheet must have columns: Email (or email), group (or Group/TEAM CODE)"
      });
    }

    const client = await pool.connect();
    let skyflowSyncMsg = '';

    try {
      await client.query('BEGIN');

      // 1. Update account groups
      for (const { email, groupName } of emailsToUpdate) {
        await client.query('UPDATE ss_account SET "accountGroup" = $1 WHERE "accountEmail" = $2', [groupName, email]);
      }

      // 2. Replace old team_groups for this course
      const oldTeams2 = await client.query('SELECT id FROM team_groups WHERE course_id = $1', [courseId]);
      for (const t of oldTeams2.rows) {
        await client.query('DELETE FROM team_group_members WHERE team_group_id = $1', [t.id]);
      }
      await client.query('DELETE FROM team_groups WHERE course_id = $1', [courseId]);
      const orgRes2 = await client.query('SELECT id FROM organizations LIMIT 1');
      const orgId2 = orgRes2.rows[0]?.id;
      let tn = 1;
      for (const groupName of Object.keys(groupCounts)) {
        await client.query(
          `INSERT INTO team_groups (organization_id, team_number, name, course_id, status)
           VALUES ($1, $2, $3, $4, 'active')`,
          [orgId2, tn, groupName, courseId]
        );
        tn++;
      }

      // 3. Auto-save sheet to connected_sheets so it appears in workspace-sync
      await client.query(
        `INSERT INTO ss_connected_sheets ("courseID", "sheetId", "sheetName", "groupCount")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("courseID", "sheetId") DO UPDATE SET "sheetName" = $3, "groupCount" = $4`,
        [courseId, sheetId, sheetTitle, Object.keys(groupCounts).length]
      );

      // 4. SkyFlow cross-sync
      try {
        const courseRes = await client.query(
          'SELECT "courseName", "courseCode", "courseSection", "courseAdviser" FROM ss_courses WHERE id = $1',
          [courseId]
        );
        const courseData = courseRes.rows[0];
        const orgResult = await client.query('SELECT id FROM organizations LIMIT 1');
        const orgId = orgResult.rows[0]?.id;

        if (orgId) {
          let teamNumber = 1;
          for (const groupName of Object.keys(groupCounts)) {
            const teamName = `${courseData?.courseCode || ''} - ${groupName}`;
            const existing = await client.query(
              'SELECT id FROM team_groups WHERE organization_id = $1 AND name = $2',
              [orgId, teamName]
            );

            let teamId;
            if (existing.rows.length > 0) {
              teamId = existing.rows[0].id;
              await client.query('UPDATE team_groups SET updated_at = NOW() WHERE id = $1', [teamId]);
            } else {
              const teamResult = await client.query(
                `INSERT INTO team_groups (organization_id, team_number, name, description, adviser_name, status)
                 VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
                [orgId, teamNumber, teamName,
                  `${courseData?.courseName} | ${courseData?.courseSection}`,
                  courseData?.courseAdviser]
              );
              teamId = teamResult.rows[0].id;
            }

            await client.query('DELETE FROM team_group_members WHERE team_group_id = $1', [teamId]);
            let memberNum = 1;
            for (const entry of emailsToUpdate) {
              if (entry.groupName === groupName) {
                await client.query(
                  `INSERT INTO team_group_members (team_group_id, member_number, name, email, is_leader)
                   VALUES ($1, $2, $3, $4, $5)`,
                  [teamId, memberNum, entry.fullName, entry.email, memberNum === 1]
                );
                memberNum++;
              }
            }
            teamNumber++;
          }
          skyflowSyncMsg = ' Synced to SkyFlow Team Board!';
        }
      } catch (syncErr: any) {
        console.error('SkyFlow sync error:', syncErr.message);
        skyflowSyncMsg = ' (SkyFlow sync skipped)';
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return res.json({
      success: true,
      message: `Imported ${Object.keys(groupCounts).length} groups (${emailsToUpdate.length} members) from "${sheetTitle}"!${skyflowSyncMsg}`,
      groupCount: Object.keys(groupCounts).length,
      memberCount: emailsToUpdate.length
    });

  } catch (error: any) {
    if (error?.response?.status === 404 || error?.response?.status === 403) {
      return res.status(400).json({ error: "Cannot access this Sheet. Make sure it's shared with 'Anyone with the link'." });
    }
    return res.status(500).json({ error: error?.message || "Failed to parse spreadsheet." });
  }
});

app.get('/api/courses/:id/teams', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    const user: any = jwt.verify(token, process.env.JWT_SECRET || "test");
    const courseId = req.params.id;

    const accRes = await pool.query('SELECT "accountRole", "accountEmail", "accountGroup", "accountName" FROM ss_account WHERE account_id = $1', [user.id]);
    const account = accRes.rows[0];
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const role = account.accountRole;
    const { rows: allGroups } = await pool.query('SELECT id, name as "groupName", team_number, adviser_name as adviser, proposed_project, consultation_dates, comments, grade, course_id as "courseID" FROM team_groups WHERE course_id = $1 ORDER BY team_number', [courseId]);

    if (role === 'Admin') {
      return res.json({ teams: allGroups, userRole: 'admin', viewType: 'all' });
    } else if (role === 'Advisers') {
      const crsRes = await pool.query('SELECT "courseAdviser" FROM ss_courses WHERE id = $1', [courseId]);
      if (crsRes.rows[0]?.courseAdviser === account.accountEmail) {
        return res.json({ teams: allGroups, userRole: 'adviser', viewType: 'advised' });
      }
      return res.json({ teams: [], userRole: 'adviser', viewType: 'none' });
    } else {
      const studentGroup = account.accountGroup;
      if (studentGroup) {
        const myTeam = allGroups.filter((g: any) => g.groupName === studentGroup);
        return res.json({ teams: myTeam, userRole: 'student', viewType: 'own' });
      }
      return res.json({ teams: [], userRole: 'student', viewType: 'none' });
    }
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
});

// ── GET single course detail ──
app.get('/api/courses/:id', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || 'test');
    const { rows } = await pool.query(
      `SELECT id, "courseName", "courseCode", "courseSection", "courseTerm", "courseKey", "courseAmount", "courseAdviser"
       FROM ss_courses WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Course not found' });
    return res.json(rows[0]);
  } catch (err) {
    return res.sendStatus(403);
  }
});

app.post('/api/courses', verifyInstructor, async (req, res) => {
  const { courseName, courseCode, courseSection, courseTerm } = req.body;
  const user = (req as any).user;

  if (!courseName || !courseCode || !courseSection || !courseTerm) {
    return res.status(400).json({ error: "Missing course details" });
  }

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let courseKey = Array.from({ length: 8 }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('');

  try {
    const { rows } = await pool.query(
      `INSERT INTO ss_courses ("courseName", "courseCode", "courseSection", "courseTerm", "courseKey", "courseAmount", "courseAdviser") 
       VALUES ($1, $2, $3, $4, $5, 0, $6) RETURNING *`,
      [courseName, courseCode, courseSection, courseTerm, courseKey, user.email]
    );
    res.json(rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/enroll', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  const { courseKey } = req.body;
  if (!courseKey) return res.status(400).json({ error: "Missing course key" });

  try {
    const user: any = jwt.verify(token, process.env.JWT_SECRET || "test");

    const crsRes = await pool.query('SELECT id, "courseAmount" FROM ss_courses WHERE "courseKey" = $1', [courseKey]);
    const course = crsRes.rows[0];

    if (!course) return res.status(404).json({ error: "Invalid course key" });

    try {
      await pool.query('INSERT INTO ss_enrollments (account_id, course_id) VALUES ($1, $2)', [user.id, course.id]);
      await pool.query('UPDATE ss_courses SET "courseAmount" = "courseAmount" + 1 WHERE id = $1', [course.id]);
      return res.json({ success: true, message: "Successfully enrolled!" });
    } catch (enrollError: any) {
      if (enrollError.code === '23505') {
        return res.status(400).json({ error: "You are already enrolled in this course." });
      }
      throw enrollError;
    }
  } catch (err) {
    return res.status(401).json({ error: "Invalid session token" });
  }
});

// ================================================================
// WORKSPACE SYNC — Connected Sheets
// ================================================================

app.post('/api/courses/:id/connect-sheet', verifyInstructor, async (req, res) => {
  const courseId = req.params.id;
  const { sheetUrl } = req.body;
  if (!sheetUrl) return res.status(400).json({ error: 'Missing sheet URL' });

  const match = sheetUrl.match(/\/d\/(.*?)\//);
  if (!match?.[1]) return res.status(400).json({ error: 'Invalid Google Sheets URL' });
  const sheetId = match[1];

  try {
    let sheetName = 'Connected Sheet';
    try {
      const metaRes = await axios.get(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title&key=`,
        { validateStatus: () => true }
      );
      sheetName = metaRes.data?.properties?.title || sheetName;
    } catch { }

    try {
      const { rows } = await pool.query(
        'INSERT INTO ss_connected_sheets ("courseID", "sheetId", "sheetName") VALUES ($1, $2, $3) RETURNING *',
        [courseId, sheetId, sheetName]
      );
      return res.json({ success: true, sheet: rows[0] });
    } catch (error: any) {
      if (error.code === '23505') return res.status(400).json({ error: 'Sheet already connected to this course' });
      throw error;
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to connect sheet' });
  }
});

app.get('/api/courses/:id/sheets', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || 'test');
    const { rows } = await pool.query('SELECT * FROM ss_connected_sheets WHERE "courseID" = $1 ORDER BY created_at DESC', [req.params.id]);

    const sheets = rows.map((s: any) => ({
      id: s.id,
      sheetId: s.sheetId,
      sheetName: s.sheetName,
      courseId: s.courseID,
      createdAt: s.created_at,
      groupCount: s.groupCount || 0
    }));

    return res.json({ sheets });
  } catch {
    return res.status(403).json({ error: 'Unauthorized' });
  }
});

app.delete('/api/connected-sheets/:id', verifyInstructor, async (req, res) => {
  try {
    await pool.query('DELETE FROM ss_connected_sheets WHERE id = $1', [req.params.id]);
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ================================================================
// GOOGLE DRIVE & SHEETS API
// ================================================================

const getAccessToken = async (token: string): Promise<string | null> => {
  try {
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'test');
    const { rows } = await pool.query('SELECT "googleAccessToken" FROM ss_account WHERE account_id = $1', [decoded.id]);
    return rows[0]?.googleAccessToken || null;
  } catch {
    return null;
  }
};

app.get('/api/drive/files', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);
  const accessToken = await getAccessToken(token);
  if (!accessToken) return res.status(403).json({ error: 'No Google access token. Please re-login.' });

  try {
    const response = await axios.get(
      'https://www.googleapis.com/drive/v3/files?pageSize=50&fields=files(id,name,mimeType,modifiedTime,size)',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return res.json({ files: response.data.files || [] });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch Drive files. Ensure Drive API is enabled and scopes are approved.' });
  }
});

app.get('/api/drive/folders', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);
  const accessToken = await getAccessToken(token);
  if (!accessToken) return res.status(403).json({ error: 'No Google access token.' });

  try {
    const response = await axios.get(
      `https://www.googleapis.com/drive/v3/files?q=mimeType%3D%27application%2Fvnd.google-apps.folder%27&pageSize=50&fields=files(id,name)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return res.json({ folders: response.data.files || [] });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch Drive folders.' });
  }
});

app.get('/api/sheets/list', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);
  const accessToken = await getAccessToken(token);
  if (!accessToken) return res.status(403).json({ error: 'No Google access token.' });

  try {
    const response = await axios.get(
      `https://www.googleapis.com/drive/v3/files?q=mimeType%3D%27application%2Fvnd.google-apps.spreadsheet%27&pageSize=50&orderBy=modifiedTime%20desc&fields=files(id,name,modifiedTime,owners)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return res.json({ files: response.data.files || [] });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch Sheets.' });
  }
});

app.get('/api/me', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, "test", (err: any, user: any) => {
    if (err) return res.sendStatus(403);
    res.json(user);
  });
});

// ================================================================
// GOOGLE CALENDAR API
// ================================================================

const getCalendarClient = (accessToken: string) => {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({ version: 'v3', auth });
};

// GET /api/calendar/events — fetch events in a rolling window
app.get('/api/calendar/events', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'test');

    const timeMin = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const minDate = timeMin.split('T')[0];
    const maxDate = timeMax.split('T')[0];

    const accessToken = await getAccessToken(token);

    let googleEvents: any[] = [];
    let googleError: string | null = null;

    if (accessToken) {
      try {
        const calendar = getCalendarClient(accessToken);
        const response = await calendar.events.list({
          calendarId: 'primary',
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 100,
        });
        googleEvents = response.data.items || [];
      } catch (err: any) {
        googleError = err?.message || 'Google Calendar fetch failed';
      }
    } else {
      googleError = 'No Google access token found';
    }

    const role = String(decoded?.role || '');
    const isInstructor = role === 'Admin' || role === 'Adviser' || role === 'Advisers';
    const isStudent = !isInstructor;
    if (isStudent) {
      // Student/group calendar should not show open consultations from Google feed.
      googleEvents = googleEvents.filter(
        (event: any) => !String(event?.summary || '').toLowerCase().includes('consultation')
      );
    } else {
      // Adviser/Admin should not see past consultations in calendar.
      const nowTs = Date.now();
      googleEvents = googleEvents.filter((event: any) => {
        const summary = String(event?.summary || '').toLowerCase();
        if (!summary.includes('consultation')) return true;

        const endDateTime = event?.end?.dateTime;
        const endDate = event?.end?.date;
        const endTs = endDateTime
          ? new Date(endDateTime).getTime()
          : endDate
            ? new Date(`${endDate}T23:59:59`).getTime()
            : NaN;

        if (!Number.isFinite(endTs)) return true;
        return endTs >= nowTs;
      });
    }

    const googleEventIds = new Set(googleEvents.map((e: any) => e.id).filter(Boolean));

    let consultationRows: any[] = [];
    const calendarDebug: any = {
      enabled: true,
      role,
      isStudent,
      requesterEmail: null,
      groupNamesLower: [] as string[],
      legacyGroupIds: [] as number[],
      relevantSlotIds: [] as number[],
      directBookedSlotIds: [] as number[],
      mergedSlotIds: [] as number[],
      returnedFallbackSlotIds: [] as number[],
      googleEventCount: googleEvents.length,
    };

    if (isStudent) {
      let requesterEmail = String(
        decoded?.email || decoded?.accountEmail || decoded?.account_email || ''
      ).trim().toLowerCase();
      const requesterId = decoded?.id || decoded?.account_id;
      if (!requesterEmail && requesterId) {
        const accountEmailRes = await pool.query(
          'SELECT "accountEmail" FROM ss_account WHERE account_id = $1',
          [requesterId]
        );
        requesterEmail = String(accountEmailRes.rows[0]?.accountEmail || '').trim().toLowerCase();
      }
      calendarDebug.requesterEmail = requesterEmail || null;

      const memberships = await pool.query(
        `SELECT tg.name as group_name,
                sg."smallgroupID" as legacy_group_id
         FROM team_group_members tgm
         JOIN team_groups tg ON tg.id = tgm.team_group_id
         LEFT JOIN ss_group sg ON lower(trim(sg."groupName")) = lower(trim(tg.name))
         WHERE lower(trim(tgm.email)) = lower(trim($1))`,
        [requesterEmail || '']
      );

      const groupNamesLower = memberships.rows
        .map((m: any) => String(m.group_name || '').trim().toLowerCase())
        .filter(Boolean);
      const legacyGroupIds = memberships.rows
        .map((m: any) => Number(m.legacy_group_id))
        .filter((n: number) => Number.isFinite(n));
      calendarDebug.groupNamesLower = groupNamesLower;
      calendarDebug.legacyGroupIds = legacyGroupIds;

      if (groupNamesLower.length > 0 || legacyGroupIds.length > 0 || !!requesterEmail) {
        const relevantConsultations = await pool.query(
            `SELECT cs.slot_id,
              cs.slot_date,
              cs.slot_date::text as slot_date_only,
                  cs.start_time,
                  cs.end_time,
                  cs.slot_type,
                  cs.google_event_id,
                  csg.group_name as reserved_group_name,
                  EXISTS (
                    SELECT 1
                    FROM ss_consultation_bookings cb
                    WHERE cb.slot_id = cs.slot_id
                      AND cb.status = 'BOOKED'
                      AND (
                        lower(trim(cb.group_name)) = ANY($3::text[])
                        OR cb.group_id = ANY($4::int[])
                      )
                  ) as booked_by_group,
                  EXISTS (
                    SELECT 1
                    FROM ss_consultation_bookings cb
                    WHERE cb.slot_id = cs.slot_id
                      AND cb.status = 'BOOKED'
                      AND lower(trim(cb.booked_by_email)) = lower(trim($5))
                  ) as booked_by_user
           FROM ss_consultation_slots cs
           LEFT JOIN ss_consultation_slot_groups csg ON csg.slot_id = cs.slot_id
           WHERE cs.slot_date BETWEEN $1::date AND $2::date
             AND (
               lower(trim(COALESCE(csg.group_name, ''))) = ANY($3::text[])
               OR EXISTS (
                 SELECT 1
                 FROM ss_consultation_bookings cb
                 WHERE cb.slot_id = cs.slot_id
                   AND cb.status = 'BOOKED'
                   AND (
                     lower(trim(cb.group_name)) = ANY($3::text[])
                     OR cb.group_id = ANY($4::int[])
                   )
               )
               OR EXISTS (
                 SELECT 1
                 FROM ss_consultation_bookings cb
                 WHERE cb.slot_id = cs.slot_id
                   AND cb.status = 'BOOKED'
                   AND lower(trim(cb.booked_by_email)) = lower(trim($5))
               )
               OR cs.allowed_group_id = ANY($4::int[])
             )
           ORDER BY cs.slot_date ASC, cs.start_time ASC`,
          [minDate, maxDate, groupNamesLower, legacyGroupIds, requesterEmail || '']
        );
        calendarDebug.relevantSlotIds = relevantConsultations.rows.map((row: any) => Number(row.slot_id));

        let bookedByUserRows: any[] = [];
        if (requesterEmail) {
          const directBookings = await pool.query(
                `SELECT cs.slot_id,
                  cs.slot_date,
                  cs.slot_date::text as slot_date_only,
                    cs.start_time,
                    cs.end_time,
                    cs.slot_type,
                    cs.google_event_id,
                    csg.group_name as reserved_group_name,
                    true as booked_by_group,
                    true as booked_by_user
             FROM ss_consultation_bookings cb
             JOIN ss_consultation_slots cs ON cs.slot_id = cb.slot_id
             LEFT JOIN ss_consultation_slot_groups csg ON csg.slot_id = cs.slot_id
             WHERE cb.status = 'BOOKED'
               AND lower(trim(cb.booked_by_email)) = lower(trim($1))
               AND cs.slot_date BETWEEN $2::date AND $3::date
             ORDER BY cs.slot_date ASC, cs.start_time ASC`,
            [requesterEmail, minDate, maxDate]
          );
          bookedByUserRows = directBookings.rows;
          calendarDebug.directBookedSlotIds = bookedByUserRows.map((row: any) => Number(row.slot_id));
        }

        const mergedBySlot = new Map<number, any>();
        [...relevantConsultations.rows, ...bookedByUserRows].forEach((row: any) => {
          if (!mergedBySlot.has(Number(row.slot_id))) {
            mergedBySlot.set(Number(row.slot_id), row);
          }
        });
        consultationRows = Array.from(mergedBySlot.values());
        calendarDebug.mergedSlotIds = consultationRows.map((row: any) => Number(row.slot_id));
      }
    } else {
      // Adviser/Admin: include owned consultation slots that may not exist in Google feed.
      const ownedConsultations = await pool.query(
        `SELECT slot_id, slot_date, slot_date::text as slot_date_only, start_time, end_time, slot_type, google_event_id,
                NULL::text as reserved_group_name,
                false as booked_by_group
         FROM ss_consultation_slots
         WHERE owner_account_id = $1
           AND slot_date BETWEEN $2::date AND $3::date
           AND (slot_date::date + end_time::time) >= ((now() AT TIME ZONE 'Asia/Manila')::timestamp)
         ORDER BY slot_date ASC, start_time ASC`,
        [decoded.id, minDate, maxDate]
      );
      consultationRows = ownedConsultations.rows;
    }

    const toDateOnly = (value: any): string => {
      const raw = String(value || '').trim();
      const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
      if (isoMatch && isoMatch[1]) return isoMatch[1];
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) {
        const yyyy = parsed.getFullYear();
        const mm = String(parsed.getMonth() + 1).padStart(2, '0');
        const dd = String(parsed.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }
      return raw;
    };

    const toTimeOnly = (value: any): string => {
      const raw = String(value || '').trim();
      const match = raw.match(/^(\d{2}:\d{2})(?::(\d{2}))?/);
      if (!match) return raw;
      const hhmm = match[1];
      const ss = match[2] || '00';
      return `${hhmm}:${ss}`;
    };

    const fallbackConsultationEvents = consultationRows
      .filter((slot: any) => !slot.google_event_id || !googleEventIds.has(slot.google_event_id))
      .map((slot: any) => {
        const slotDate = toDateOnly(slot.slot_date_only || slot.slot_date);
        const startTime = toTimeOnly(slot.start_time);
        const endTime = toTimeOnly(slot.end_time);
        const summary = isStudent
          ? ((slot.booked_by_group || slot.booked_by_user)
              ? 'Consultation (Booked)'
              : 'Consultation (Reserved for Your Group)')
          : `Consultation (${slot.slot_type === 'SPECIFIC_GROUP' ? 'Specific Group' : 'FCFS'})`;

        return {
          id: `consultation-slot-${slot.slot_id}`,
          summary,
          description: `Consultation slot #${slot.slot_id}`,
          start: { dateTime: `${slotDate}T${startTime}+08:00`, timeZone: 'Asia/Manila' },
          end: { dateTime: `${slotDate}T${endTime}+08:00`, timeZone: 'Asia/Manila' },
        };
      });
    calendarDebug.returnedFallbackSlotIds = fallbackConsultationEvents
      .map((event: any) => String(event.id || ''))
      .filter((id: string) => id.startsWith('consultation-slot-'))
      .map((id: string) => Number(id.replace('consultation-slot-', '')))
      .filter((n: number) => Number.isFinite(n));
    calendarDebug.fallbackConsultationCount = fallbackConsultationEvents.length;

    return res.json({
      events: [...googleEvents, ...fallbackConsultationEvents],
      calendarStatus: {
        googleConnected: !!accessToken,
        googleFetchOk: !googleError,
        googleError,
        fallbackConsultationCount: fallbackConsultationEvents.length,
      },
      calendarDebug,
    });
  } catch (err: any) {
    console.error('Error fetching calendar events:', err.message);
    return res.status(500).json({ error: 'Failed to fetch calendar events.' });
  }
});

// GET /api/calendar/connection-status — quick Google Calendar connectivity check
app.get('/api/calendar/connection-status', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || 'test');

    const accessToken = await getAccessToken(token);
    if (!accessToken) {
      return res.json({
        connected: false,
        reason: 'No Google access token. Please re-login with Google.',
      });
    }

    try {
      const calendar = getCalendarClient(accessToken);
      await calendar.calendarList.list({ maxResults: 1 });
      return res.json({ connected: true });
    } catch (err: any) {
      return res.json({
        connected: false,
        reason: err?.message || 'Unable to reach Google Calendar API',
      });
    }
  } catch {
    return res.sendStatus(403);
  }
});

// POST /api/calendar/events — create a new event
app.post('/api/calendar/events', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);
  const accessToken = await getAccessToken(token);
  if (!accessToken) return res.status(403).json({ error: 'No Google access token. Please re-login.' });

  try {
    const { title, description, location, startTime, endTime, allDay, attendees } = req.body;
    const calendar = getCalendarClient(accessToken);

    const start = allDay
      ? { date: new Date(startTime).toISOString().split('T')[0] }
      : { dateTime: new Date(startTime).toISOString(), timeZone: 'Asia/Manila' };
    const end = allDay
      ? { date: new Date(endTime).toISOString().split('T')[0] }
      : { dateTime: new Date(endTime).toISOString(), timeZone: 'Asia/Manila' };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: {
        summary: title,
        description,
        location,
        start,
        end,
        attendees: attendees || [],
      },
    } as any);

    return res.json({ event: response.data });
  } catch (err: any) {
    console.error('Error creating calendar event:', err.message);
    return res.status(500).json({ error: 'Failed to create calendar event.' });
  }
});

// PUT /api/calendar/events/:eventId — update an existing event
app.put('/api/calendar/events/:eventId', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);
  const accessToken = await getAccessToken(token);
  if (!accessToken) return res.status(403).json({ error: 'No Google access token. Please re-login.' });

  try {
    const { eventId } = req.params;
    const { title, description, location, startTime, endTime, allDay, attendees } = req.body;
    const calendar = getCalendarClient(accessToken);

    const start = allDay
      ? { date: new Date(startTime).toISOString().split('T')[0] }
      : { dateTime: new Date(startTime).toISOString(), timeZone: 'Asia/Manila' };
    const end = allDay
      ? { date: new Date(endTime).toISOString().split('T')[0] }
      : { dateTime: new Date(endTime).toISOString(), timeZone: 'Asia/Manila' };

    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId,
      resource: {
        summary: title,
        description,
        location,
        start,
        end,
        attendees: attendees || [],
      },
    } as any);

    return res.json({ event: response.data });
  } catch (err: any) {
    console.error('Error updating calendar event:', err.message);
    return res.status(500).json({ error: 'Failed to update calendar event.' });
  }
});

// DELETE /api/calendar/events/:eventId — delete an event
app.delete('/api/calendar/events/:eventId', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);
  const accessToken = await getAccessToken(token);
  if (!accessToken) return res.status(403).json({ error: 'No Google access token. Please re-login.' });

  try {
    const { eventId } = req.params;
    const calendar = getCalendarClient(accessToken);

    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
    });

    return res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting calendar event:', err.message);
    return res.status(500).json({ error: 'Failed to delete calendar event.' });
  }
});

// ================================================================
// CONSULTATION BOOKING SYSTEM API
// ================================================================

const ensureLegacyGroupIdFromTeamGroup = async (teamGroupId: string): Promise<number | null> => {
  const teamResult = await pool.query(
    `SELECT
        tg.id,
        tg.name AS "groupName",
        tg.course_id AS "courseID",
        tgm.member_number,
        tgm.email,
        tgm.is_leader
     FROM team_groups tg
     LEFT JOIN team_group_members tgm ON tgm.team_group_id = tg.id
     WHERE tg.id = $1
     ORDER BY tgm.member_number ASC`,
    [teamGroupId]
  );

  if (teamResult.rows.length === 0) return null;

  const groupName = teamResult.rows[0].groupName;

  const existingLegacy = await pool.query(
    `SELECT "smallgroupID" AS "smallgroupID"
     FROM ss_group
     WHERE lower(trim("groupName")) = lower(trim($1))
     LIMIT 1`,
    [groupName]
  );

  if (existingLegacy.rows.length > 0) {
    const existingId = Number(existingLegacy.rows[0].smallgroupID);
    return Number.isFinite(existingId) ? existingId : null;
  }

  const members: Array<string | null> = [null, null, null, null, null];
  const roles: Array<string | null> = [null, null, null, null, null];

  for (const row of teamResult.rows) {
    const idx = Number(row.member_number) - 1;
    if (idx >= 0 && idx < 5) {
      members[idx] = row.email || null;
      roles[idx] = row.email ? (row.is_leader ? 'leader' : 'member') : null;
    }
  }

  let inserted;
  try {
    inserted = await pool.query(
      `INSERT INTO ss_group
        ("groupName", member1, member2, member3, member4, member5, "roleOne", "roleTwo", "roleThree", "roleFour", "roleFive")
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING "smallgroupID"`,
      [
        groupName,
        members[0],
        members[1],
        members[2],
        members[3],
        members[4],
        roles[0],
        roles[1],
        roles[2],
        roles[3],
        roles[4],
      ]
    );
  } catch {
    return null;
  }

  const createdId = Number(inserted.rows[0]?.smallgroupID);
  return Number.isFinite(createdId) ? createdId : null;
};

// GET /api/group/by-member/:email — Get a user's group
app.get('/api/group/by-member/:email', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "test", async (err: any, user: any) => {
    if (err) return res.sendStatus(403);

    try {
      const { email } = req.params;
      const normalizedEmail = String(email || '').trim().toLowerCase();
      
      // Resolve membership from team_group_members (temporary source of truth for booking permissions).
      const { rows } = await pool.query(
        `SELECT
            tg.id AS "smallgroupID",
            tg.name AS "groupName",
            tg.course_id AS "courseID",
            tgm.member_number AS requester_member_number
         FROM team_group_members tgm
         JOIN team_groups tg ON tg.id = tgm.team_group_id
         WHERE lower(trim(tgm.email)) = $1
         ORDER BY tgm.member_number ASC
         LIMIT 1`,
        [normalizedEmail]
      );

      if (rows.length === 0) {
        return res.json({ group: null });
      }

      const group = rows[0];
      const memberNumber = group.requester_member_number ? Number(group.requester_member_number) : null;

      // Resolve legacy numeric group id for booking tables that still use integer group_id.
      let bookingGroupId: number | null = null;
      try {
        const legacyGroupResult = await pool.query(
          `SELECT "smallgroupID" AS "smallgroupID"
           FROM ss_group
           WHERE lower(trim("groupName")) = lower(trim($1))
           LIMIT 1`,
          [group.groupName]
        );
        if (legacyGroupResult.rows.length > 0) {
          const parsed = Number(legacyGroupResult.rows[0].smallgroupID);
          bookingGroupId = Number.isFinite(parsed) ? parsed : null;
        }
      } catch {
        bookingGroupId = null;
      }

      if (bookingGroupId == null) {
        try {
          bookingGroupId = await ensureLegacyGroupIdFromTeamGroup(String(group.smallgroupID));
        } catch {
          bookingGroupId = null;
        }
      }

      const membersResult = await pool.query(
        `SELECT member_number, email, is_leader
         FROM team_group_members
         WHERE team_group_id = $1
         ORDER BY member_number ASC`,
        [group.smallgroupID]
      );

      const member1 = membersResult.rows.find((m: any) => Number(m.member_number) === 1)?.email || null;
      const member2 = membersResult.rows.find((m: any) => Number(m.member_number) === 2)?.email || null;
      const leader = membersResult.rows.find((m: any) => Boolean(m.is_leader))?.email || member1;
      const canBookConsultation = memberNumber === 1 || memberNumber === 2;

      return res.json({
        group: {
          ...group,
          teamGroupID: group.smallgroupID,
          smallgroupID: bookingGroupId,
          bookingGroupId,
          member1,
          member2,
          roleOne: leader,
          canBookConsultation,
          memberNumber,
        },
      });
    } catch (err: any) {
      console.error('Error fetching group:', err.message);
      return res.status(500).json({ error: 'Failed to fetch group.' });
    }
  });
});

// POST /api/consultation/slots — Adviser creates consultation slots
app.post('/api/consultation/slots', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "test", async (err: any, user: any) => {
    if (err || (user.role !== 'Adviser' && user.role !== 'Admin')) return res.sendStatus(403);

    try {
      const { courseId, slotDate, startTime, endTime, slotType, maxGroups, allowedGroupId, selectedGroups, multipleSlots, isWholeDay, isWholeWeek } = req.body;

      await pool.query(
        `CREATE TABLE IF NOT EXISTS public.ss_consultation_slot_groups (
          id serial PRIMARY KEY,
          slot_id integer NOT NULL UNIQUE REFERENCES public.ss_consultation_slots(slot_id) ON DELETE CASCADE,
          group_ref text,
          group_name text NOT NULL,
          created_at timestamp with time zone NOT NULL DEFAULT now()
        )`
      );

      if (!courseId || !slotDate || !startTime || !endTime || !slotType) {
        return res.status(400).json({ error: 'Missing required fields.' });
      }

      // Get adviser's access token for Google Calendar
      const { rows } = await pool.query(
        'SELECT "googleAccessToken" FROM ss_account WHERE account_id = $1',
        [user.id]
      );
      
      if (!rows[0]?.googleAccessToken) {
        return res.status(403).json({ error: 'No Google access token. Please re-login.' });
      }

      const calendar = getCalendarClient(rows[0].googleAccessToken);
      const createdSlots = [];
      
      // Determine which groups to create slots for
      let groupsToCreate = [];
      if (slotType === 'SPECIFIC_GROUP' && selectedGroups && Array.isArray(selectedGroups)) {
        groupsToCreate = selectedGroups; // Multiple groups
      } else if (allowedGroupId) {
        groupsToCreate = [allowedGroupId]; // Legacy single group
      } else {
        groupsToCreate = [null]; // FCFS slot with no specific group
      }

      const parseTimeToMinutes = (time: string, fallback: number) => {
        if (!time || typeof time !== 'string' || !time.includes(':')) return fallback;
        const parts = time.split(':');
        const h = Number(parts[0]);
        const m = Number(parts[1]);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return fallback;
        return h * 60 + m;
      };

      const formatMinutesToTime = (totalMinutes: number) => {
        const h = Math.floor(totalMinutes / 60)
          .toString()
          .padStart(2, '0');
        const m = (totalMinutes % 60).toString().padStart(2, '0');
        return `${h}:${m}`;
      };

      if (slotType === 'SPECIFIC_GROUP' && groupsToCreate.length === 0) {
        return res.status(400).json({ error: 'Please select at least one group.' });
      }

      // Generate time slots for each group/date combination
      let timeSlots: Array<{date: string, groupId: any, groupName: string, start: string, end: string}> = [];

      // Build target dates for slot creation.
      let slotDates = [String(slotDate).slice(0, 10)];
      if (isWholeWeek) {
        const base = new Date(String(slotDate));
        if (Number.isNaN(base.getTime())) {
          return res.status(400).json({ error: 'Invalid slot date for whole-week schedule.' });
        }
        const monday = new Date(base);
        const dayOfWeek = monday.getDay();
        const toMondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        monday.setDate(monday.getDate() + toMondayOffset);

        slotDates = Array.from({ length: 6 }).map((_, idx) => {
          const d = new Date(monday);
          d.setDate(monday.getDate() + idx);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        });
      } else if (multipleSlots && Array.isArray(multipleSlots) && multipleSlots.length > 0) {
        slotDates = multipleSlots.map((d: any) => String(d || '').slice(0, 10)).filter(Boolean);
      }
      
      if (isWholeDay && slotType === 'SPECIFIC_GROUP' && groupsToCreate.length > 0) {
        // Whole-day specific groups: cap each group to <= 60 minutes and add 10-minute breaks.
        const breakBetweenGroups = 10;
        const lunchStart = 12 * 60;
        const lunchEnd = 13 * 60 + 30;
        const numGroups = groupsToCreate.length;
        const dayStart = parseTimeToMinutes(startTime, 8 * 60);
        const dayEnd = parseTimeToMinutes(endTime, 17 * 60);
        const totalMinutes = dayEnd - dayStart;

        if (totalMinutes <= 0) {
          return res.status(400).json({ error: 'Invalid consultation time range.' });
        }

        const totalBreakTime = (numGroups - 1) * breakBetweenGroups;
        const lunchOverlap = Math.max(0, Math.min(dayEnd, lunchEnd) - Math.max(dayStart, lunchStart));
        const availableTime = totalMinutes - totalBreakTime - lunchOverlap;
        const minutesPerGroup = Math.min(60, Math.floor(availableTime / numGroups));

        if (minutesPerGroup <= 0) {
          return res.status(400).json({
            error: 'Not enough time to schedule all selected groups with breaks. Please reduce groups or use a different date.',
          });
        }
        
        for (const date of slotDates) {
          let currentMinute = dayStart;

          for (const groupId of groupsToCreate) {
            const groupData = await pool.query('SELECT name FROM team_groups WHERE id = $1', [groupId]);
            const groupName = groupData.rows[0]?.name || 'Group ' + groupId;

            // Never start a consultation during lunch break.
            if (currentMinute >= lunchStart && currentMinute < lunchEnd) {
              currentMinute = lunchEnd;
            }

            let endMinute = currentMinute + minutesPerGroup;

            // If a slot would overlap lunch, move it after lunch.
            if (currentMinute < lunchStart && endMinute > lunchStart) {
              currentMinute = lunchEnd;
              endMinute = currentMinute + minutesPerGroup;
            }

            if (endMinute > dayEnd) {
              return res.status(400).json({
                error: 'Selected groups do not fit within the available day window. Reduce groups or choose another date.',
              });
            }

            timeSlots.push({
              date,
              groupId,
              groupName,
              start: formatMinutesToTime(currentMinute),
              end: formatMinutesToTime(endMinute)
            });

            // Move to next slot with fixed 10-minute break.
            currentMinute = endMinute + breakBetweenGroups;
          }
        }
      } else {
        // Original logic: handle slots as before
        for (const date of slotDates) {
          for (const groupId of groupsToCreate) {
            const groupData = groupId ? await pool.query('SELECT name FROM team_groups WHERE id = $1', [groupId]) : { rows: [] };
            const groupName = groupId && groupData.rows[0] ? groupData.rows[0].name : 'Available';
            
            timeSlots.push({
              date,
              groupId,
              groupName,
              start: startTime,
              end: endTime
            });
          }
        }
      }
      
      // Create slots for each time slot
      for (const timeSlot of timeSlots) {
        try {
          // Insert slot
          const slotResult = await pool.query(
            `INSERT INTO ss_consultation_slots 
             (course_id, owner_account_id, owner_role, slot_date, start_time, end_time, slot_type, max_groups, allowed_group_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
             RETURNING *`,
            [courseId, user.id, user.role, String(timeSlot.date || slotDate).slice(0, 10), timeSlot.start, timeSlot.end, slotType, maxGroups || 1]
          );

          const slot = slotResult.rows[0];

          if (slotType === 'SPECIFIC_GROUP' && timeSlot.groupId) {
            await pool.query(
              `INSERT INTO ss_consultation_slot_groups (slot_id, group_ref, group_name)
               VALUES ($1, $2, $3)
               ON CONFLICT (slot_id) DO UPDATE
               SET group_ref = EXCLUDED.group_ref,
                   group_name = EXCLUDED.group_name`,
              [slot.slot_id, String(timeSlot.groupId), timeSlot.groupName]
            );
          }

          // Create Google Calendar event
          try {
            const slotDateOnly = String(timeSlot.date || slotDate).slice(0, 10);
            const startDateTime = `${slotDateOnly}T${timeSlot.start}:00+08:00`;
            const endDateTime = `${slotDateOnly}T${timeSlot.end}:00+08:00`;

            const event = await calendar.events.insert({
              calendarId: 'primary',
              resource: {
                summary: `Consultation - ${timeSlot.groupName}`,
                description: `Consultation slot - ${slotType === 'SPECIFIC_GROUP' ? timeSlot.groupName : 'First Come First Serve'}`,
                start: { dateTime: startDateTime, timeZone: 'Asia/Manila' },
                end: { dateTime: endDateTime, timeZone: 'Asia/Manila' },
              },
            } as any);

            // Update slot with Google Event ID
            await pool.query(
              'UPDATE ss_consultation_slots SET google_event_id = $1 WHERE slot_id = $2',
              [event.data.id, slot.slot_id]
            );

            createdSlots.push({ ...slot, google_event_id: event.data.id });
          } catch (calErr: any) {
            console.error('Google Calendar error:', calErr.message);
            createdSlots.push(slot); // Return slot even if calendar creation fails
          }
        } catch (err: any) {
          console.error('Error creating slot:', err.message);
        }
      }

      console.log('Created', createdSlots.length, 'slots for course', courseId);
      return res.json({ slots: createdSlots });
    } catch (err: any) {
      console.error('Error creating consultation slots:', err.message);
      return res.status(500).json({ error: 'Failed to create consultation slots.' });
    }
  });
});

// GET /api/consultation/slots/:courseId — Get available slots for a course
app.get('/api/consultation/slots/:courseId', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "test", async (err: any, user: any) => {
    if (err) return res.sendStatus(403);

    try {
      const { courseId } = req.params;
      const { futureOnly, groupName } = req.query;

      let query = `
        SELECT 
          cs.*,
          to_char(cs.slot_date::date, 'YYYY-MM-DD') as slot_date_only,
          csg.group_name as reserved_group_name,
          sa."accountName" as adviser_name,
          (SELECT COUNT(*) FROM ss_consultation_bookings 
           WHERE slot_id = cs.slot_id AND status = 'BOOKED') as current_groups,
          CASE
            WHEN cs.slot_type = 'SPECIFIC_GROUP' AND csg.group_name IS NOT NULL
              THEN LEAST(cs.max_groups, (SELECT COUNT(*) FROM ss_consultation_bookings WHERE slot_id = cs.slot_id AND status = 'BOOKED') + 1)
            ELSE (SELECT COUNT(*) FROM ss_consultation_bookings WHERE slot_id = cs.slot_id AND status = 'BOOKED')
          END as current_groups_display
        FROM ss_consultation_slots cs
        JOIN ss_account sa ON cs.owner_account_id = sa.account_id
        LEFT JOIN ss_consultation_slot_groups csg ON csg.slot_id = cs.slot_id
        WHERE cs.course_id = $1
      `;

      const params: any[] = [courseId];

      if (futureOnly === 'true') {
        query += ` AND cs.slot_date::date >= CURRENT_DATE`;
      }

      if (groupName && String(groupName).trim()) {
        params.push(String(groupName));
        query += ` AND (
          cs.slot_type = 'FIRST_COME_FIRST_SERVE'
          OR lower(trim(csg.group_name)) = lower(trim($${params.length}))
        )`;
      }

      query += ` ORDER BY cs.slot_date::date ASC, cs.start_time ASC`;

      const { rows } = await pool.query(query, params);
      return res.json({ slots: rows });
    } catch (err: any) {
      console.error('Error fetching slots:', err.message);
      return res.status(500).json({ error: 'Failed to fetch slots.' });
    }
  });
});

// GET /api/consultation/slots/adviser/:adviserId — Get adviser's slots
app.get('/api/consultation/slots/adviser/:adviserId', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "test", async (err: any, user: any) => {
    if (err || (user.role !== 'Adviser' && user.role !== 'Admin')) return res.sendStatus(403);

    try {
      const { adviserId } = req.params;
      
      // Only allow advisers to see their own data
      if (user.id != adviserId && user.role !== 'Admin') {
        return res.sendStatus(403);
      }

      const { rows } = await pool.query(
        `SELECT 
          cs.*,
          to_char(cs.slot_date::date, 'YYYY-MM-DD') as slot_date_only,
          csg.group_name as reserved_group_name,
          (SELECT COUNT(*) FROM ss_consultation_bookings 
           WHERE slot_id = cs.slot_id AND status IN ('BOOKED', 'RESCHEDULED', 'CONFIRMED')) as current_groups,
          CASE
            WHEN cs.slot_type = 'SPECIFIC_GROUP' AND csg.group_name IS NOT NULL
              THEN LEAST(cs.max_groups, (SELECT COUNT(*) FROM ss_consultation_bookings WHERE slot_id = cs.slot_id AND status IN ('BOOKED', 'RESCHEDULED', 'CONFIRMED')) + 1)
            ELSE (SELECT COUNT(*) FROM ss_consultation_bookings WHERE slot_id = cs.slot_id AND status IN ('BOOKED', 'RESCHEDULED', 'CONFIRMED'))
          END as current_groups_display
        FROM ss_consultation_slots cs
        LEFT JOIN ss_consultation_slot_groups csg ON csg.slot_id = cs.slot_id
        WHERE cs.owner_account_id = $1
        ORDER BY cs.slot_date::date ASC, cs.start_time ASC`,
        [adviserId]
      );

      return res.json({ slots: rows });
    } catch (err: any) {
      console.error('Error fetching adviser slots:', err.message);
      return res.status(500).json({ error: 'Failed to fetch adviser slots.' });
    }
  });
});

// PUT /api/consultation/slots/:slotId — Adviser/Admin updates a consultation slot
app.put('/api/consultation/slots/:slotId', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "test", async (err: any, user: any) => {
    if (err || (user.role !== 'Adviser' && user.role !== 'Admin')) return res.sendStatus(403);

    try {
      const { slotId } = req.params;
      const { slotDate, startTime, endTime, maxGroups } = req.body;

      if (!slotDate || !startTime || !endTime) {
        return res.status(400).json({ error: 'slotDate, startTime, and endTime are required.' });
      }

      const slotResult = await pool.query(
        `SELECT cs.*, csg.group_name as reserved_group_name
         FROM ss_consultation_slots cs
         LEFT JOIN ss_consultation_slot_groups csg ON csg.slot_id = cs.slot_id
         WHERE cs.slot_id = $1`,
        [slotId]
      );

      if (slotResult.rows.length === 0) {
        return res.status(404).json({ error: 'Slot not found.' });
      }

      const slot = slotResult.rows[0];
      if (user.role !== 'Admin' && user.id != slot.owner_account_id) {
        return res.sendStatus(403);
      }

      if (startTime >= endTime) {
        return res.status(400).json({ error: 'Start time must be earlier than end time.' });
      }

      const updated = await pool.query(
        `UPDATE ss_consultation_slots
         SET slot_date = $1::date,
             start_time = $2,
             end_time = $3,
             max_groups = CASE WHEN $4::int IS NULL THEN max_groups ELSE $4::int END
         WHERE slot_id = $5
         RETURNING *`,
        [slotDate, startTime, endTime, maxGroups ?? null, slotId]
      );

      const updatedSlot = updated.rows[0];

      if (slot.google_event_id) {
        try {
          const ownerTokenResult = await pool.query(
            'SELECT "googleAccessToken" FROM ss_account WHERE account_id = $1',
            [slot.owner_account_id]
          );

          const ownerAccessToken = ownerTokenResult.rows[0]?.googleAccessToken;
          if (ownerAccessToken) {
            const calendar = getCalendarClient(ownerAccessToken);
            const groupLabel = slot.reserved_group_name || (slot.slot_type === 'FIRST_COME_FIRST_SERVE' ? 'FCFS' : 'Specific Group');
            await calendar.events.update({
              calendarId: 'primary',
              eventId: slot.google_event_id,
              resource: {
                summary: `Consultation - ${groupLabel}`,
                description: `Consultation slot - ${groupLabel}`,
                start: { dateTime: `${slotDate}T${startTime}:00+08:00`, timeZone: 'Asia/Manila' },
                end: { dateTime: `${slotDate}T${endTime}:00+08:00`, timeZone: 'Asia/Manila' },
              },
            } as any);
          }
        } catch (calErr: any) {
          console.error('Google Calendar update error:', calErr.message);
        }
      }

      return res.json({ slot: updatedSlot });
    } catch (err: any) {
      console.error('Error updating consultation slot:', err.message);
      return res.status(500).json({ error: 'Failed to update consultation slot.' });
    }
  });
});

// DELETE /api/consultation/slots/:slotId — Adviser/Admin deletes a consultation slot
app.delete('/api/consultation/slots/:slotId', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "test", async (err: any, user: any) => {
    if (err || (user.role !== 'Adviser' && user.role !== 'Admin')) return res.sendStatus(403);

    try {
      const { slotId } = req.params;

      const slotResult = await pool.query(
        'SELECT slot_id, owner_account_id, google_event_id FROM ss_consultation_slots WHERE slot_id = $1',
        [slotId]
      );

      if (slotResult.rows.length === 0) {
        return res.status(404).json({ error: 'Slot not found.' });
      }

      const slot = slotResult.rows[0];
      if (user.role !== 'Admin' && user.id != slot.owner_account_id) {
        return res.sendStatus(403);
      }

      if (slot.google_event_id) {
        try {
          const ownerTokenResult = await pool.query(
            'SELECT "googleAccessToken" FROM ss_account WHERE account_id = $1',
            [slot.owner_account_id]
          );
          const ownerAccessToken = ownerTokenResult.rows[0]?.googleAccessToken;

          if (ownerAccessToken) {
            const calendar = getCalendarClient(ownerAccessToken);
            await calendar.events.delete({
              calendarId: 'primary',
              eventId: slot.google_event_id,
            } as any);
          }
        } catch (calErr: any) {
          console.error('Google Calendar delete error:', calErr.message);
        }
      }

      await pool.query('DELETE FROM ss_consultation_slots WHERE slot_id = $1', [slotId]);
      return res.json({ success: true });
    } catch (err: any) {
      console.error('Error deleting consultation slot:', err.message);
      return res.status(500).json({ error: 'Failed to delete consultation slot.' });
    }
  });
});

// PUT /api/consultation/slots/day/:slotDate — Adviser/Admin updates all owned slots on a day
app.put('/api/consultation/slots/day/:slotDate', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "test", async (err: any, user: any) => {
    if (err || (user.role !== 'Adviser' && user.role !== 'Admin')) return res.sendStatus(403);

    try {
      const { slotDate } = req.params;
      const { newDate, maxGroups, extraGroups } = req.body;
      const normalizedSlotDate = String(slotDate || '').split('T')[0];
      const normalizedNewDate = String(newDate || '').split('T')[0];
      const parsedExtraGroups = Number.isFinite(Number(extraGroups)) ? Number(extraGroups) : 0;

      if (!normalizedNewDate) {
        return res.status(400).json({ error: 'newDate is required.' });
      }

      if (parsedExtraGroups < 0 || parsedExtraGroups > 5) {
        return res.status(400).json({ error: 'extraGroups must be between 0 and 5.' });
      }

      const slotsResult = await pool.query(
        `SELECT cs.*, csg.group_name as reserved_group_name
         FROM ss_consultation_slots cs
         LEFT JOIN ss_consultation_slot_groups csg ON csg.slot_id = cs.slot_id
         WHERE cs.owner_account_id = $1 AND cs.slot_date::date = $2::date
         ORDER BY cs.start_time ASC`,
        [user.id, normalizedSlotDate]
      );

      if (slotsResult.rows.length === 0) {
        return res.status(404).json({ error: 'No consultation slots found for this date.' });
      }

      const updatedSlots = [];

      const parseTimeToMinutes = (timeValue: string): number => {
        const [hourRaw, minuteRaw] = String(timeValue || '00:00').split(':');
        const hour = Number(hourRaw);
        const minute = Number(minuteRaw);
        if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;
        return hour * 60 + minute;
      };

      const formatMinutesToTime = (totalMinutes: number): string => {
        const hour = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
        const minute = (totalMinutes % 60).toString().padStart(2, '0');
        return `${hour}:${minute}`;
      };

      for (const slot of slotsResult.rows) {
        const updated = await pool.query(
          `UPDATE ss_consultation_slots
           SET slot_date = $1::date,
               max_groups = CASE
                 WHEN $2::int IS NULL THEN max_groups
                 WHEN slot_type = 'FIRST_COME_FIRST_SERVE' THEN $2::int
                 ELSE max_groups
               END
           WHERE slot_id = $3
           RETURNING *`,
          [normalizedNewDate, maxGroups ?? null, slot.slot_id]
        );

        updatedSlots.push(updated.rows[0]);

        if (slot.google_event_id) {
          try {
            const ownerTokenResult = await pool.query(
              'SELECT "googleAccessToken" FROM ss_account WHERE account_id = $1',
              [slot.owner_account_id]
            );

            const ownerAccessToken = ownerTokenResult.rows[0]?.googleAccessToken;
            if (ownerAccessToken) {
              const calendar = getCalendarClient(ownerAccessToken);
              const groupLabel = slot.reserved_group_name || (slot.slot_type === 'FIRST_COME_FIRST_SERVE' ? 'FCFS' : 'Specific Group');
              await calendar.events.update({
                calendarId: 'primary',
                eventId: slot.google_event_id,
                resource: {
                  summary: `Consultation - ${groupLabel}`,
                  description: `Consultation slot - ${groupLabel}`,
                  start: { dateTime: `${normalizedNewDate}T${slot.start_time}:00+08:00`, timeZone: 'Asia/Manila' },
                  end: { dateTime: `${normalizedNewDate}T${slot.end_time}:00+08:00`, timeZone: 'Asia/Manila' },
                },
              } as any);
            }
          } catch (calErr: any) {
            console.error('Google Calendar bulk update error:', calErr.message);
          }
        }
      }

      const createdSlots = [];

      if (parsedExtraGroups > 0) {
        const distinctCourseIds = Array.from(new Set(slotsResult.rows.map((s: any) => s.course_id)));
        if (distinctCourseIds.length !== 1) {
          return res.status(400).json({
            error: 'Cannot add extra groups on a day containing multiple courses.',
          });
        }

        const courseId = distinctCourseIds[0];
        const dayEndMinute = 17 * 60;
        const lunchStartMinute = 12 * 60;
        const lunchEndMinute = 13 * 60 + 30;
        const breakMinutes = 10;
        const slotMinutes = 60;

        const lastEndMinute = slotsResult.rows.reduce((max: number, slot: any) => {
          const endMinute = parseTimeToMinutes(slot.end_time);
          return Math.max(max, endMinute);
        }, 8 * 60);

        let currentStartMinute = Math.max(lastEndMinute + breakMinutes, 8 * 60);

        const ownerTokenResult = await pool.query(
          'SELECT "googleAccessToken" FROM ss_account WHERE account_id = $1',
          [user.id]
        );
        const ownerAccessToken = ownerTokenResult.rows[0]?.googleAccessToken;
        const calendar = ownerAccessToken ? getCalendarClient(ownerAccessToken) : null;

        for (let i = 0; i < parsedExtraGroups; i++) {
          if (currentStartMinute >= lunchStartMinute && currentStartMinute < lunchEndMinute) {
            currentStartMinute = lunchEndMinute;
          }

          let currentEndMinute = currentStartMinute + slotMinutes;

          // Prevent automatically created extra slots from overlapping lunch break.
          if (currentStartMinute < lunchStartMinute && currentEndMinute > lunchStartMinute) {
            currentStartMinute = lunchEndMinute;
            currentEndMinute = currentStartMinute + slotMinutes;
          }

          if (currentEndMinute > dayEndMinute) {
            return res.status(400).json({
              error: `Only ${i} extra group slot(s) can fit in the day with 1-hour slots and 10-minute breaks.`,
            });
          }

          const startTime = formatMinutesToTime(currentStartMinute);
          const endTime = formatMinutesToTime(currentEndMinute);

          const inserted = await pool.query(
            `INSERT INTO ss_consultation_slots
             (course_id, owner_account_id, owner_role, slot_date, start_time, end_time, slot_type, max_groups, allowed_group_id)
             VALUES ($1, $2, $3, $4, $5, $6, 'FIRST_COME_FIRST_SERVE', 1, NULL)
             RETURNING *`,
            [courseId, user.id, user.role, normalizedNewDate, startTime, endTime]
          );

          const createdSlot = inserted.rows[0];

          if (calendar) {
            try {
              const event = await calendar.events.insert({
                calendarId: 'primary',
                resource: {
                  summary: 'Consultation - FCFS',
                  description: 'Consultation slot - FCFS (extra group slot)',
                  start: { dateTime: `${normalizedNewDate}T${startTime}:00+08:00`, timeZone: 'Asia/Manila' },
                  end: { dateTime: `${normalizedNewDate}T${endTime}:00+08:00`, timeZone: 'Asia/Manila' },
                },
              } as any);

              if (event?.data?.id) {
                await pool.query(
                  'UPDATE ss_consultation_slots SET google_event_id = $1 WHERE slot_id = $2',
                  [event.data.id, createdSlot.slot_id]
                );
                createdSlot.google_event_id = event.data.id;
              }
            } catch (calErr: any) {
              console.error('Google Calendar extra slot create error:', calErr.message);
            }
          }

          createdSlots.push(createdSlot);
          currentStartMinute = currentEndMinute + breakMinutes;
        }
      }

      return res.json({ success: true, updatedSlots, createdSlots });
    } catch (err: any) {
      console.error('Error updating day consultation slots:', err.message);
      return res.status(500).json({ error: 'Failed to update day consultation slots.' });
    }
  });
});

// DELETE /api/consultation/slots/day/:slotDate — Adviser/Admin deletes all owned slots on a day
app.delete('/api/consultation/slots/day/:slotDate', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "test", async (err: any, user: any) => {
    if (err || (user.role !== 'Adviser' && user.role !== 'Admin')) return res.sendStatus(403);

    try {
      const { slotDate } = req.params;
      const normalizedSlotDate = String(slotDate || '').split('T')[0];

      const slotsResult = await pool.query(
        `SELECT slot_id, owner_account_id, google_event_id
         FROM ss_consultation_slots
         WHERE owner_account_id = $1 AND slot_date::date = $2::date`,
        [user.id, normalizedSlotDate]
      );

      if (slotsResult.rows.length === 0) {
        return res.status(404).json({ error: 'No consultation slots found for this date.' });
      }

      for (const slot of slotsResult.rows) {
        if (slot.google_event_id) {
          try {
            const ownerTokenResult = await pool.query(
              'SELECT "googleAccessToken" FROM ss_account WHERE account_id = $1',
              [slot.owner_account_id]
            );

            const ownerAccessToken = ownerTokenResult.rows[0]?.googleAccessToken;
            if (ownerAccessToken) {
              const calendar = getCalendarClient(ownerAccessToken);
              await calendar.events.delete({
                calendarId: 'primary',
                eventId: slot.google_event_id,
              } as any);
            }
          } catch (calErr: any) {
            console.error('Google Calendar bulk delete error:', calErr.message);
          }
        }
      }

      await pool.query(
        'DELETE FROM ss_consultation_slots WHERE owner_account_id = $1 AND slot_date::date = $2::date',
        [user.id, normalizedSlotDate]
      );

      return res.json({ success: true, deletedCount: slotsResult.rows.length });
    } catch (err: any) {
      console.error('Error deleting day consultation slots:', err.message);
      return res.status(500).json({ error: 'Failed to delete day consultation slots.' });
    }
  });
});

// POST /api/consultation/bookings — Group books a consultation slot
app.post('/api/consultation/bookings', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "test", async (err: any, user: any) => {
    if (err) return res.sendStatus(403);

    try {
      const { slotId, groupId, groupName, courseId } = req.body;
      const requesterEmail = String(user?.email || user?.accountEmail || '').trim().toLowerCase();

      await pool.query(
        `CREATE TABLE IF NOT EXISTS public.ss_consultation_slot_groups (
          id serial PRIMARY KEY,
          slot_id integer NOT NULL UNIQUE REFERENCES public.ss_consultation_slots(slot_id) ON DELETE CASCADE,
          group_ref text,
          group_name text NOT NULL,
          created_at timestamp with time zone NOT NULL DEFAULT now()
        )`
      );

      if (!slotId || !courseId || (!groupId && !groupName)) {
        return res.status(400).json({ error: 'Missing required fields.' });
      }

      if (!requesterEmail) {
        return res.status(403).json({ error: 'Unable to verify booking permissions.' });
      }

      // Enforce booking permission from team_group_members: only member_number 1 or 2 can book.
      let normalizedGroupName = String(groupName || '').trim().toLowerCase();
      const membershipResult = await pool.query(
        `SELECT
            tg.id AS group_id,
            tg.name AS group_name,
            tgm.member_number
         FROM team_group_members tgm
         JOIN team_groups tg ON tg.id = tgm.team_group_id
         WHERE lower(trim(tgm.email)) = $1
           AND (tg.id::text = $2 OR lower(trim(tg.name)) = $3)
         LIMIT 1`,
        [requesterEmail, String(groupId), normalizedGroupName]
      );

      if (membershipResult.rows.length === 0) {
        return res.status(403).json({ error: 'You are not part of a valid group for booking.' });
      }

      const requesterMemberNumber = Number(membershipResult.rows[0].member_number);
      const isAllowedBooker = requesterMemberNumber === 1 || requesterMemberNumber === 2;

      if (!normalizedGroupName) {
        normalizedGroupName = String(membershipResult.rows[0].group_name || '').trim().toLowerCase();
      }

      if (!isAllowedBooker) {
        return res.status(403).json({ error: 'Only member #1 or member #2 can book consultations.' });
      }

      let bookingGroupId = Number(groupId);
      if (!Number.isFinite(bookingGroupId)) {
        const legacyGroupResult = await pool.query(
          `SELECT "smallgroupID" AS "smallgroupID"
           FROM ss_group
           WHERE lower(trim("groupName")) = lower(trim($1))
           LIMIT 1`,
          [normalizedGroupName]
        );

        if (legacyGroupResult.rows.length === 0) {
          const ensuredGroupId = await ensureLegacyGroupIdFromTeamGroup(String(membershipResult.rows[0].group_id));
          bookingGroupId = Number(ensuredGroupId);
        } else {
          bookingGroupId = Number(legacyGroupResult.rows[0].smallgroupID);
        }

        if (!Number.isFinite(bookingGroupId)) {
          return res.status(400).json({ error: 'Invalid numeric group id for booking.' });
        }
      }

      // Get slot details
      const slotResult = await pool.query(
        'SELECT * FROM ss_consultation_slots WHERE slot_id = $1',
        [slotId]
      );

      if (slotResult.rows.length === 0) {
        return res.status(404).json({ error: 'Slot not found.' });
      }

      const slot = slotResult.rows[0];

      // Check if group can book (FCFS - check max groups, or SPECIFIC - check if allowed)
      if (slot.slot_type === 'FIRST_COME_FIRST_SERVE') {
        const bookingCountResult = await pool.query(
          'SELECT COUNT(*) as count FROM ss_consultation_bookings WHERE slot_id = $1 AND status = $2',
          [slotId, 'BOOKED']
        );

        const currentCount = parseInt(bookingCountResult.rows[0].count);
        if (currentCount >= slot.max_groups) {
          return res.status(400).json({ error: 'This slot is fully booked.' });
        }
      } else if (slot.slot_type === 'SPECIFIC_GROUP') {
        const reservedGroupResult = await pool.query(
          'SELECT group_ref, group_name FROM ss_consultation_slot_groups WHERE slot_id = $1',
          [slotId]
        );

        if (reservedGroupResult.rows.length > 0) {
          const reserved = reservedGroupResult.rows[0];
          const allowedByRef = reserved.group_ref && String(reserved.group_ref) === String(groupId);
          const allowedByName = reserved.group_name && groupName && String(reserved.group_name).trim().toLowerCase() === String(groupName).trim().toLowerCase();
          const isReservedGroup = !!allowedByRef || !!allowedByName;

          if (isReservedGroup) {
            return res.status(200).json({
              booking: null,
              message: 'This reserved group is already confirmed for the slot.',
            });
          }

          if (slot.max_groups > 1) {
            // 1 seat is consumed by the reserved group, remaining seats are FCFS.
            const bookingCountResult = await pool.query(
              'SELECT COUNT(*) as count FROM ss_consultation_bookings WHERE slot_id = $1 AND status = $2',
              [slotId, 'BOOKED']
            );

            const currentCount = parseInt(bookingCountResult.rows[0].count);
            const remainingFcfsSeats = Math.max(0, Number(slot.max_groups) - 1);

            if (currentCount >= remainingFcfsSeats) {
              return res.status(400).json({ error: 'This slot is fully booked.' });
            }
          } else {
            return res.status(400).json({
              error: `This slot is reserved for ${reserved.group_name}.`,
            });
          }
        } else if (slot.allowed_group_id != null && slot.allowed_group_id != groupId) {
          return res.status(400).json({ error: 'This slot is reserved for a specific group.' });
        }
      }

      // Check if group already booked this week
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      const existingBookingResult = await pool.query(
        `SELECT COUNT(*) as count FROM ss_consultation_bookings cb
         JOIN ss_consultation_slots cs ON cb.slot_id = cs.slot_id
         WHERE cb.group_id = $1 AND cs.course_id = $2 AND cs.slot_date >= $3 AND cb.status = $4`,
        [bookingGroupId, courseId, startOfWeek.toISOString().split('T')[0], 'BOOKED']
      );

      if (parseInt(existingBookingResult.rows[0].count) > 0) {
        return res.status(400).json({ error: 'Group has already booked a consultation this week.' });
      }

      // Create booking
      const bookingResult = await pool.query(
        `INSERT INTO ss_consultation_bookings 
         (slot_id, course_id, group_id, group_name, booked_by_email, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [slotId, courseId, bookingGroupId, groupName, user.email, 'BOOKED']
      );

      const booking = bookingResult.rows[0];

      // Update Google Calendar event to show booking
      try {
        const { rows } = await pool.query(
          'SELECT "googleAccessToken" FROM ss_account WHERE account_id = $1',
          [slot.owner_account_id]
        );

        if (rows[0]?.googleAccessToken && slot.google_event_id) {
          const calendar = getCalendarClient(rows[0].googleAccessToken);
          
          const bookingCountResult = await pool.query(
            'SELECT COUNT(*) as count FROM ss_consultation_bookings WHERE slot_id = $1 AND status = $2',
            [slotId, 'BOOKED']
          );

          const newDescription = `Consultation slot\nBookings: ${bookingCountResult.rows[0].count}/${slot.max_groups}`;
          
          await calendar.events.update({
            calendarId: 'primary',
            eventId: slot.google_event_id,
            resource: { description: newDescription },
          } as any);
        }
      } catch (calErr: any) {
        console.error('Google Calendar update error:', calErr.message);
      }

      return res.json({ booking });
    } catch (err: any) {
      console.error('Error creating booking:', err.message);
      return res.status(500).json({ error: 'Failed to create booking.' });
    }
  });
});

// GET /api/consultation/bookings/group/:groupId — Get group's bookings
app.get('/api/consultation/bookings/group/:groupId', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "test", async (err: any, user: any) => {
    if (err) return res.sendStatus(403);

    try {
      const { groupId } = req.params;

      const { rows } = await pool.query(
        `SELECT 
          cb.*,
          cs.slot_date,
          cs.start_time,
          cs.end_time,
          sa."accountName" as adviser_name,
          sc."courseName"
        FROM ss_consultation_bookings cb
        JOIN ss_consultation_slots cs ON cb.slot_id = cs.slot_id
        JOIN ss_account sa ON cs.owner_account_id = sa.account_id
        JOIN ss_courses sc ON cb.course_id = sc.id
        WHERE cb.group_id = $1
        ORDER BY cs.slot_date DESC`,
        [groupId]
      );

      return res.json({ bookings: rows });
    } catch (err: any) {
      console.error('Error fetching group bookings:', err.message);
      return res.status(500).json({ error: 'Failed to fetch bookings.' });
    }
  });
});

// GET /api/consultation/bookings/slot/:slotId — Get bookings for a specific slot (adviser/admin)
app.get('/api/consultation/bookings/slot/:slotId', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "test", async (err: any, user: any) => {
    if (err || (user.role !== 'Adviser' && user.role !== 'Admin')) return res.sendStatus(403);

    try {
      const { slotId } = req.params;

      const slotResult = await pool.query(
        'SELECT owner_account_id FROM ss_consultation_slots WHERE slot_id = $1',
        [slotId]
      );

      if (slotResult.rows.length === 0) {
        return res.status(404).json({ error: 'Slot not found.' });
      }

      if (user.role !== 'Admin' && user.id != slotResult.rows[0].owner_account_id) {
        return res.sendStatus(403);
      }

      const { rows } = await pool.query(
        `SELECT 
          cb.*,
          cs.slot_date,
          cs.start_time,
          cs.end_time,
          sa."accountName" as adviser_name,
          sc."courseName"
        FROM ss_consultation_bookings cb
        JOIN ss_consultation_slots cs ON cb.slot_id = cs.slot_id
        JOIN ss_account sa ON cs.owner_account_id = sa.account_id
        JOIN ss_courses sc ON cb.course_id = sc.id
        WHERE cb.slot_id = $1
        ORDER BY cb.created_at DESC`,
        [slotId]
      );

      return res.json({ bookings: rows });
    } catch (err: any) {
      console.error('Error fetching slot bookings:', err.message);
      return res.status(500).json({ error: 'Failed to fetch slot bookings.' });
    }
  });
});

// POST /api/consultation/feedback — Adviser submits consultation feedback
// Uses new normalized columns: adviser_notes, attendance_data, participation_data, status
// Legacy journal entries use old columns: conDate, conType, conMil, conSum, conAction, conAtt, isDraft, conStat, conNotes
app.post('/api/consultation/feedback', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "test", async (err: any, user: any) => {
    if (err || (user.role !== 'Adviser' && user.role !== 'Admin')) return res.sendStatus(403);

    try {
      const {
        booking_id,
        slot_id,
        group_id,
        group_name,
        adviser_notes,
        conDate,
        conMil,
        conSum,
        conAction,
        conConcerns,
        attendance_data,
        participation_data
      } = req.body;

      if (!slot_id || (!group_id && !group_name && !booking_id)) {
        return res.status(400).json({ error: 'Missing required fields.' });
      }

      let resolvedGroupName: string | null = null;

      // Primary: resolve by UUID group_id when provided.
      if (group_id) {
        const groupResult = await pool.query(
          `SELECT name as "groupName" FROM team_groups WHERE id::text = $1`,
          [String(group_id)]
        );
        if (groupResult.rows.length > 0) {
          resolvedGroupName = groupResult.rows[0].groupName;
        }
      }

      // Fallback: provided group_name from UI payload.
      if (!resolvedGroupName && group_name) {
        resolvedGroupName = String(group_name).trim();
      }

      // Fallback: resolve from booking row.
      if (!resolvedGroupName && booking_id) {
        const bookingGroup = await pool.query(
          `SELECT group_name FROM ss_consultation_bookings WHERE booking_id = $1`,
          [booking_id]
        );
        if (bookingGroup.rows.length > 0) {
          resolvedGroupName = bookingGroup.rows[0].group_name;
        }
      }

      // Fallback: specific-group slot mapping.
      if (!resolvedGroupName) {
        const slotGroup = await pool.query(
          `SELECT group_name FROM ss_consultation_slot_groups WHERE slot_id = $1`,
          [slot_id]
        );
        if (slotGroup.rows.length > 0) {
          resolvedGroupName = slotGroup.rows[0].group_name;
        }
      }

      if (!resolvedGroupName) {
        return res.status(404).json({ error: 'Group not found.' });
      }

      const groupName = resolvedGroupName;

      // Get course_id from slot
      const slotResult = await pool.query(
        `SELECT course_id FROM ss_consultation_slots WHERE slot_id = $1`,
        [slot_id]
      );

      if (slotResult.rows.length === 0) {
        return res.status(404).json({ error: 'Consultation slot not found.' });
      }

      const courseId = slotResult.rows[0].course_id;

      // Always insert a new consultation record so history can keep multiple entries.
      const consultationResult = await pool.query(
        `INSERT INTO ss_consultation 
         ("courseID", "groupName", "conDate", "conMil", "conSum", "conAction", "conConcerns", slot_id, adviser_notes, attendance_data, participation_data, status, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
         RETURNING *`,
        [
          courseId,
          groupName,
          conDate || null,
          conMil || null,
          conSum || null,
          conAction || null,
          conConcerns || null,
          slot_id,
          adviser_notes || null,
          JSON.stringify(attendance_data || {}),
          JSON.stringify(participation_data || {}),
          'SUBMITTED',
        ]
      );

      const consultation = consultationResult.rows[0];

      // Mark booking as completed after record submission so the slot is no longer active.
      if (booking_id) {
        await pool.query(
          `UPDATE ss_consultation_bookings
           SET status = $1,
               updated_at = NOW()
           WHERE booking_id = $2`,
          ['COMPLETED', booking_id]
        );
      }

      // Remove slots that should not persist after submission (reserved/single-capacity slots)
      // once there are no active BOOKED entries left.
      const slotMetaResult = await pool.query(
        `SELECT slot_type, COALESCE(max_groups, 1) AS max_groups
         FROM ss_consultation_slots
         WHERE slot_id = $1`,
        [slot_id]
      );

      if (slotMetaResult.rows.length > 0) {
        const slotMeta = slotMetaResult.rows[0];
        const activeBookingsResult = await pool.query(
          `SELECT COUNT(*)::int AS count
           FROM ss_consultation_bookings
           WHERE slot_id = $1 AND status = $2`,
          [slot_id, 'BOOKED']
        );

        const activeBookings = Number(activeBookingsResult.rows[0]?.count || 0);
        const maxGroups = Number(slotMeta.max_groups || 1);
        const shouldRemoveSlot =
          activeBookings === 0 &&
          (slotMeta.slot_type === 'SPECIFIC_GROUP' || maxGroups <= 1);

        if (shouldRemoveSlot) {
          await pool.query(
            `DELETE FROM ss_consultation_slots
             WHERE slot_id = $1`,
            [slot_id]
          );
        }
      }

      return res.json({ consultation });
    } catch (err: any) {
      console.error('Error submitting consultation feedback:', err.message);
      return res.status(500).json({ error: 'Failed to submit consultation feedback.' });
    }
  });
});

// POST /api/consultation/:slotId/form — Adviser submits consultation form
app.post('/api/consultation/:slotId/form', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "test", async (err: any, user: any) => {
    if (err || (user.role !== 'Adviser' && user.role !== 'Admin')) return res.sendStatus(403);

    try {
      const { slotId } = req.params;
      const { groupName, courseId, notes, attendanceData, participationData } = req.body;

      if (!slotId || !groupName || !courseId) {
        return res.status(400).json({ error: 'Missing required fields.' });
      }

      // Insert consultation record
      const consultationResult = await pool.query(
        `INSERT INTO ss_consultation 
         ("courseID", "groupName", slot_id, adviser_notes, attendance_data, participation_data, status, submitted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING *`,
        [courseId, groupName, slotId, notes, JSON.stringify(attendanceData || {}), JSON.stringify(participationData || {}), 'SUBMITTED']
      );

      const consultation = consultationResult.rows[0];

      return res.json({ consultation });
    } catch (err: any) {
      console.error('Error submitting consultation form:', err.message);
      return res.status(500).json({ error: 'Failed to submit consultation form.' });
    }
  });
});

// GET /api/consultation/group/:groupId/logs — Get group's consultation logs
// Returns both new booking feedback (status=SUBMITTED) and legacy journal entries (if status is populated)
app.get('/api/consultation/group/:groupId/logs', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "test", async (err: any, user: any) => {
    if (err) return res.sendStatus(403);

    try {
      const { groupId } = req.params;

      // Get group name from team_groups using the groupId (UUID)
      const groupResult = await pool.query(
        `SELECT name FROM team_groups WHERE id = $1`,
        [groupId]
      );

      if (groupResult.rows.length === 0) {
        return res.json({ logs: [] });
      }

      const groupName = groupResult.rows[0].name;

      // Find all submitted consultations for this group
      const { rows } = await pool.query(
        `SELECT 
          c.*,
          cs.slot_date,
          cs.start_time,
          sa."accountName" as adviser_name
        FROM ss_consultation c
        LEFT JOIN ss_consultation_slots cs ON c.slot_id = cs.slot_id
        LEFT JOIN ss_account sa ON cs.owner_account_id = sa.account_id
        WHERE lower(trim(c."groupName")) = lower(trim($1))
        AND c.status = 'SUBMITTED'
        AND c.submitted_at IS NOT NULL
        ORDER BY c.submitted_at DESC`,
        [groupName]
      );

      return res.json({ logs: rows });
    } catch (err: any) {
      console.error('Error fetching consultation logs:', err.message);
      return res.status(500).json({ error: 'Failed to fetch consultation logs.' });
    }
  });
});

// PUT /api/consultation/bookings/:bookingId/reschedule — Adviser reschedules a booking
app.put('/api/consultation/bookings/:bookingId/reschedule', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET || "test", async (err: any, user: any) => {
    if (err || (user.role !== 'Adviser' && user.role !== 'Admin')) return res.sendStatus(403);

    try {
      const { bookingId } = req.params;
      const { newSlotId } = req.body;

      if (!newSlotId) {
        return res.status(400).json({ error: 'New slot ID is required.' });
      }

      // Get original booking
      const bookingResult = await pool.query(
        'SELECT * FROM ss_consultation_bookings WHERE booking_id = $1',
        [bookingId]
      );

      if (bookingResult.rows.length === 0) {
        return res.status(404).json({ error: 'Booking not found.' });
      }

      const booking = bookingResult.rows[0];

      // Update booking to new slot
      const updatedResult = await pool.query(
        'UPDATE ss_consultation_bookings SET slot_id = $1, status = $2, updated_at = NOW() WHERE booking_id = $3 RETURNING *',
        [newSlotId, 'RESCHEDULED', bookingId]
      );

      return res.json({ booking: updatedResult.rows[0] });
    } catch (err: any) {
      console.error('Error rescheduling booking:', err.message);
      return res.status(500).json({ error: 'Failed to reschedule booking.' });
    }
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});