import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import 'dotenv/config';
import pg from 'pg';
import axios from 'axios';
import { parse } from 'csv-parse/sync';

const { Pool } = pg;

// Use SkyFlow's PostgreSQL database as the primary DB now
const pool = new Pool({ connectionString: process.env.SKYFLOW_DATABASE_URL });

const app = express();

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

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
      'https://www.googleapis.com/auth/spreadsheets'
    ],
    accessType: 'offline',
    prompt: 'consent'
  } as any)
);

app.get('/auth/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: 'http://localhost:3000/login' }),
  (req, res) => {
    const user = req.user as any;

    if (user.isNew) {
      const tempToken = jwt.sign(
        { email: user.email, accessToken: user.accessToken, isRegistrationToken: true },
        process.env.JWT_SECRET || "test",
        { expiresIn: '15m' }
      );
      return res.redirect(`http://localhost:3000/complete-profile?token=${tempToken}`);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.accountRole },
      process.env.JWT_SECRET || "test",
      { expiresIn: '24h' }
    );

    res.redirect(`http://localhost:3000/auth-success?token=${token}`);
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
    if (user.role !== 'Admin' && user.role !== 'Advisers') {
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

    if (user.role === 'Admin' || user.role === 'Advisers') {
      // Admin/Advisers see ALL courses
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
    const formatted = actRes.rows.map(r => ({ ...r, account_id: r.id }));
    return res.json(formatted);
  } catch (err) {
    return res.sendStatus(403);
  }
});

app.get('/api/courses/:id/groupings', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || "test");
    const { rows } = await pool.query('SELECT * FROM ss_groupings WHERE "courseID" = $1 ORDER BY "groupName"', [req.params.id]);
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
    const { rows } = await pool.query(
      'SELECT * FROM ss_groupings WHERE "courseID" = $1 ORDER BY "groupName"',
      [req.params.id]
    );
    // members_json is already JSONB, return it as 'members'
    const enriched = rows.map(g => ({
      ...g,
      members: g.members_json || [],
    }));
    return res.json(enriched);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
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

      if (!courseMap[key].groups[parsed.groupName]) {
        courseMap[key].groups[parsed.groupName] = { members: [], adviser: '', proposedProject: '' };
      }
      courseMap[key].groups[parsed.groupName].members.push({ email, fullName: displayName, memberNum: memberNum || (courseMap[key].groups[parsed.groupName].members.length + 1) });
      // Keep adviser/project from any non-empty row
      if (adviser) courseMap[key].groups[parsed.groupName].adviser = adviser;
      if (proposedProject) courseMap[key].groups[parsed.groupName].proposedProject = proposedProject;
    }

    if (Object.keys(courseMap).length === 0) {
      return res.status(400).json({
        error: 'No valid TEAM CODE rows found. Expected format: 2526-sem1-it332-01'
      });
    }

    const client = await pool.connect();
    const results: any[] = [];

    try {
      await client.query('BEGIN');

      for (const [courseKey, { parsed, groups }] of Object.entries(courseMap)) {
        if (!parsed) continue;

        // 1. Find or create the course
        const existingCourse = await client.query(
          'SELECT id FROM ss_courses WHERE "courseKey" = $1',
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

        // 2. Clear old groupings for this course
        await client.query('DELETE FROM ss_groupings WHERE "courseID" = $1', [courseId]);

        // 3. Insert new groupings with full member data
        for (const [groupName, groupData] of Object.entries(groups)) {
          const membersJson = JSON.stringify(groupData.members.map((m, i) => ({
            member_number: m.memberNum || (i + 1),
            name: m.fullName,
            email: m.email,
            is_leader: (m.memberNum || (i + 1)) === 1,
          })));

          await client.query(
            `INSERT INTO ss_groupings ("groupName", "groupMembers", "courseID", members_json, adviser, proposed_project)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [groupName, groupData.members.length, courseId, membersJson, groupData.adviser, groupData.proposedProject]
          );

          // Update accountGroup for each member
          for (const { email } of groupData.members) {
            await client.query(
              'UPDATE ss_account SET "accountGroup" = $1 WHERE "accountEmail" = $2',
              [groupName, email]
            );
          }
        }

        // 4. Save to connected sheets
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
          groups, // pass along for SkyFlow sync below
          parsed,
        });
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // ── SkyFlow sync (outside transaction — non-fatal) ──
    try {
      const orgResult = await pool.query('SELECT id FROM organizations LIMIT 1');
      const orgId = orgResult.rows[0]?.id;
      if (orgId) {
        for (const result of results) {
          const { parsed, groups } = result as any;
          let teamNumber = 1;
          for (const [groupName, groupData] of Object.entries(groups as Record<string, { members: { email: string; fullName: string }[]; adviser: string; proposedProject: string }>)) {
            const teamName = `${parsed.courseCode} - ${groupName}`;
            const existing = await pool.query(
              'SELECT id FROM team_groups WHERE organization_id = $1 AND name = $2',
              [orgId, teamName]
            );
            let teamId;
            if (existing.rows.length > 0) {
              teamId = existing.rows[0].id;
              await pool.query('UPDATE team_groups SET updated_at = NOW() WHERE id = $1', [teamId]);
            } else {
              const teamRes = await pool.query(
                `INSERT INTO team_groups (organization_id, team_number, name, description, adviser_name, status)
                 VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
                [orgId, teamNumber, teamName, `${parsed.courseName} | ${parsed.courseTerm}`, user.email || null]
              );
              teamId = teamRes.rows[0].id;
            }
            await pool.query('DELETE FROM team_group_members WHERE team_group_id = $1', [teamId]);
            let memberNum = 1;
            for (const { email, fullName } of groupData.members) {
              await pool.query(
                `INSERT INTO team_group_members (team_group_id, member_number, name, email, is_leader)
                 VALUES ($1, $2, $3, $4, $5)`,
                [teamId, memberNum, fullName, email, memberNum === 1]
              );
              memberNum++;
            }
            teamNumber++;
          }
        }
      }
    } catch (syncErr: any) {
      console.error('SkyFlow sync error (non-fatal):', syncErr.message);
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
        if (values.length > 1) {
          const headers = values[0].map((h: string) => h.trim());
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

      // 2. Replace old groupings for this course
      await client.query('DELETE FROM ss_groupings WHERE "courseID" = $1', [courseId]);
      for (const groupName of Object.keys(groupCounts)) {
        await client.query(
          'INSERT INTO ss_groupings ("groupName", "groupMembers", "courseID") VALUES ($1, $2, $3)',
          [groupName, groupCounts[groupName], courseId]
        );
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
    const { rows: allGroups } = await pool.query('SELECT * FROM ss_groupings WHERE "courseID" = $1', [courseId]);

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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});