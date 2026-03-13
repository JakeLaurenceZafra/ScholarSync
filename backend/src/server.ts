import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import 'dotenv/config';
import { GoogleDocsService } from './googleDocsService.js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

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
  async (accessToken: string, refreshToken: string | undefined, profile: any, done: any) => {
    try {
      const email = profile.emails?.[0]?.value;
      const name = profile.displayName;
      const googleId = profile.id;

      if (!email) {
        return done(new Error("No email found from Google profile"));
      }

      // Update or insert user tokens
      const { data: user, error } = await supabase
        .from('ss_account')
        .update({ 
          googleAccessToken: accessToken,
          googleRefreshToken: refreshToken || undefined // Refresh token is only sent on first consent
        })
        .eq('accountEmail', email)
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is 'No rows found'
        // If the columns don't exist yet, this might fail. 
        // We'll handle it gracefully for now if the user hasn't run the SQL.
        console.error("Error updating tokens. Ensure ss_account has googleAccessToken and googleRefreshToken columns.", error.message);
      }

      const { data: existingUser } = await supabase
        .from('ss_account')
        .select('*')
        .eq('accountEmail', email)
        .single();

      if (!existingUser) {
        // User does not exist, pass the email forward via a temporary object
        return done(null, { isNew: true, email: email } as any);
      }

      // Generate random account_id for legacy/JWT compatibility if not present (assuming UUID typically)
      // We pass the existing user directly
      return done(null, { ...existingUser, id: existingUser.account_id, email: existingUser.accountEmail } as any);
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
      'https://www.googleapis.com/auth/documents', 
      'https://www.googleapis.com/auth/drive.file'
    ],
    accessType: 'offline',
    prompt: 'consent'
  })
);

app.get('/auth/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: 'http://localhost:3000/login' }),
  (req, res) => {
    const user = req.user as any;

    if (user.isNew) {
      // Temporary token just containing their email to prove they passed Google OAuth
      const tempToken = jwt.sign(
        { email: user.email, isRegistrationToken: true },
        process.env.JWT_SECRET || "test",
        { expiresIn: '15m' }
      );
      return res.redirect(`http://localhost:3000/complete-profile?token=${tempToken}`);
    }

    // Existing user
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

    const { data: newUser, error } = await supabase
      .from('ss_account')
      .insert([{
        accountName: name,
        accountEmail: email,
        accountRole: 'Student'
      }])
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    // Create session token
    const sessionToken = jwt.sign(
      { id: newUser.account_id, email: newUser.accountEmail, role: newUser.accountRole },
      process.env.JWT_SECRET || "test",
      { expiresIn: '24h' }
    );

    res.json({ token: sessionToken, user: newUser });

  } catch (error) {
    return res.status(401).json({ error: "Token expired or invalid" });
  }
});

// Middleware to verify Admin token
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
  const { data, error } = await supabase
    .from('ss_account')
    .select('account_id, accountName, accountEmail, accountRole')
    .order('accountName');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.put('/api/accounts/:id/role', verifyAdmin, async (req, res) => {
  const accountId = req.params.id;
  const { role } = req.body;
  if (!role) return res.status(400).json({ error: "Missing role" });

  const { data, error } = await supabase
    .from('ss_account')
    .update({ accountRole: role })
    .eq('account_id', accountId)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/api/accounts/:id', verifyAdmin, async (req, res) => {
  const accountId = req.params.id;

  const { error } = await supabase
    .from('ss_account')
    .delete()
    .eq('account_id', accountId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Middleware to verify Instructor (Admin or Adviser) token
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

    // Fetch enrolled courses first
    let enrolledCourseIds: any[] = [];
    const { data: enrollments, error: enrollError } = await supabase
      .from('ss_enrollments')
      .select('course_id')
      .eq('account_id', user.id);

    if (!enrollError && enrollments) {
      enrolledCourseIds = enrollments.map(e => e.course_id);
    }

    if (user.role === 'Admin' || user.role === 'Advisers') {
      // Fetch created courses
      const { data: createdCourses, error: createdError } = await supabase
        .from('ss_courses')
        .select('*')
        .eq('courseAdviser', user.email)
        .order('id', { ascending: false });

      if (createdError) return res.status(500).json({ error: createdError.message });

      // Fetch enrolled courses details if any
      let enrolledCourses: any[] = [];
      if (enrolledCourseIds.length > 0) {
        const { data, error } = await supabase
          .from('ss_courses')
          .select('*')
          .in('id', enrolledCourseIds)
          .order('id', { ascending: false });
        if (data) enrolledCourses = data;
      }

      // Merge and deduplicate by id
      const allCourses = [...(createdCourses || []), ...enrolledCourses];
      const uniqueCoursesMap = new Map();
      for (const c of allCourses) {
        uniqueCoursesMap.set(c.id, c);
      }
      const uniqueCourses = Array.from(uniqueCoursesMap.values());
      uniqueCourses.sort((a, b) => b.id - a.id); // Sort descending

      return res.json(uniqueCourses);
    }

    // Student logic: Only fetch enrolled courses
    if (user.role === 'Student') {
      if (enrolledCourseIds.length === 0) {
        return res.json([]);
      }

      const { data: enrolledCourses, error: coursesError } = await supabase
        .from('ss_courses')
        .select('*')
        .in('id', enrolledCourseIds)
        .order('id', { ascending: false });

      if (coursesError) return res.status(500).json({ error: coursesError.message });
      return res.json(enrolledCourses);
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
    jwt.verify(token as string, process.env.JWT_SECRET || "test");
    const courseId = req.params.id;

    const { data, error } = await supabase
      .from('ss_courses')
      .select('*')
      .eq('id', courseId)
      .single();

    if (error) return res.status(404).json({ error: "Course not found" });
    return res.json(data);
  } catch (err) {
    return res.sendStatus(403);
  }
});

app.get('/api/courses/:id/members', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token as string, process.env.JWT_SECRET || "test");
    const courseId = req.params.id;

    // STEP 1: Get all account_ids enrolled in this course
    const { data: enrollments, error: enrollError } = await supabase
      .from('ss_enrollments')
      .select('account_id')
      .eq('course_id', courseId);

    if (enrollError) return res.status(500).json({ error: enrollError.message });

    if (!enrollments || enrollments.length === 0) {
      return res.json([]);
    }

    // Extract raw IDs
    const accountIds = enrollments.map(e => e.account_id);

    // STEP 2: Fetch the account records matching those IDs safely
    const { data: accounts, error: accountError } = await supabase
      .from('ss_account')
      .select('account_id, accountName, accountEmail, accountRole')
      .in('account_id', accountIds);

    if (accountError) return res.status(500).json({ error: accountError.message });

    return res.json(accounts);
  } catch (err) {
    return res.sendStatus(403);
  }
});

app.get('/api/courses/:id/groupings', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token as string, process.env.JWT_SECRET || "test");
    const courseId = req.params.id;

    const { data, error } = await supabase
      .from('ss_groupings')
      .select('*')
      .eq('courseID', courseId);

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    return res.sendStatus(403);
  }
});

app.get('/api/courses/:id/consultations', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    const user: any = jwt.verify(token, process.env.JWT_SECRET || "test");
    const courseId = req.params.id;

    let query = supabase
      .from('ss_consultation')
      .select('*')
      .eq('courseID', courseId);

    // If user is a student, only show published consultations
    if (user.role === 'Student') {
      query = query.eq('isDraft', false);
    }

    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });
    return res.json(data || []);
  } catch (err) {
    return res.sendStatus(403);
  }
});

app.post('/api/courses/:id/consultations', verifyInstructor, async (req: express.Request, res: express.Response) => {
  const courseId = req.params.id;
  const { conDate, conType, conMil, conSum, isDraft, conStat, groupName } = req.body;

  if (!conDate || !conType || !conMil || !conStat || !groupName) {
    return res.status(400).json({ error: "Missing required consultation details" });
  }

  let attendeesStr = '';
  let actionsStr = '';

  if (groupName) {
    // Find all users assigned to this group
    const { data: students } = await supabase
      .from('ss_account')
      .select('accountName')
      .eq('accountGroup', groupName);

    if (students && students.length > 0) {
      attendeesStr = students.map(s => s.accountName).join(', ');
    }

    // Fetch tasks for the group to auto-populate conAction
    const { data: group } = await supabase.from('ss_group').select('smallgroupID').eq('groupName', groupName).single();
    if (group) {
        const { data: tasks } = await supabase.from('ss_grouptasks').select('taskTitle').eq('groupID', group.smallgroupID);
        if (tasks && tasks.length > 0) {
            actionsStr = tasks.map(t => `- ${t.taskTitle}`).join('\n');
        }
    }
  }

  const { data, error } = await supabase
    .from('ss_consultation')
    .insert([{
      courseID: courseId,
      groupName,
      conDate,
      conType,
      conMil,
      conSum: conSum || '',
      conAction: actionsStr,
      conAtt: attendeesStr,
      isDraft: isDraft || false,
      conStat
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Archive if published
  if (data && !data.isDraft) {
    try {
      const user = (req as any).user;
      await GoogleDocsService.archiveConsultation(data, user.email);
    } catch (archiveError) {
      console.error("Archive failed:", archiveError);
    }
  }

  res.json(data);
});

app.put('/api/consultations/:id', verifyInstructor, async (req: express.Request, res: express.Response) => {
  const conID = req.params.id;
  const { conDate, conType, conMil, conSum, conAction, isDraft, conStat, groupName } = req.body;

  const { data, error } = await supabase
    .from('ss_consultation')
    .update({
      conDate,
      conType,
      conMil,
      conSum,
      conAction,
      isDraft,
      conStat,
      groupName
    })
    .eq('conID', conID)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Archive if published
  if (data && !data.isDraft) {
    try {
      const user = (req as any).user;
      await GoogleDocsService.archiveConsultation(data, user.email);
    } catch (archiveError) {
      console.error("Archive failed:", archiveError);
    }
  }

  res.json(data);
});

// GET existing attendance record
app.get('/api/consultations/:id/attendance', verifyInstructor, async (req, res) => {
  const conID = req.params.id;

  try {
    const { data: record, error } = await supabase
      .from('ss_attendance')
      .select('*')
      .eq('conID', conID)
      .single();

    if (error || !record) return res.json(null);

    // Collect IDs
    const idList = [
      record.oneID, record.twoID, record.threeID, record.fourID, record.fiveID
    ].filter(Boolean);

    if (idList.length === 0) return res.json({});

    // Fetch matching accounts to translate ID -> Name
    const { data: accounts } = await supabase
      .from('ss_account')
      .select('account_id, accountName')
      .in('account_id', idList);

    const accountMap = new Map(accounts?.map(a => [a.account_id, a.accountName]) || []);

    const attendanceMap: Record<string, string> = {};
    const extract = (idVal: number | null, statusVal: string | null) => {
      if (idVal && accountMap.has(idVal)) {
        attendanceMap[accountMap.get(idVal)!] = statusVal || 'Present';
      }
    };

    extract(record.oneID, record.mem1);
    extract(record.twoID, record.mem2);
    extract(record.threeID, record.mem3);
    extract(record.fourID, record.mem4);
    extract(record.fiveID, record.mem5);

    res.json(attendanceMap);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// UPSERT attendance record
app.put('/api/consultations/:id/attendance', verifyInstructor, async (req, res) => {
  const conID = req.params.id;
  const { groupName, attendance } = req.body; // attendance is Record<string, 'Present' | 'Absent'>

  if (!groupName || !attendance) return res.status(400).json({ error: "Missing required properties." });

  try {
    // 1. Get Group Structure
    const { data: group } = await supabase
      .from('ss_group')
      .select('member1, member2, member3, member4, member5')
      .eq('groupName', groupName)
      .single();

    if (!group) return res.status(404).json({ error: "Linked group not found" });

    // 2. Map Emails to Account IDs via ss_account
    const emailList = [group.member1, group.member2, group.member3, group.member4, group.member5].filter(Boolean);
    const { data: accounts } = await supabase
      .from('ss_account')
      .select('account_id, accountEmail, accountName')
      .in('accountEmail', emailList);

    const accountByEmail = new Map(accounts?.map(a => [a.accountEmail, a]) || []);

    // Helper to get ID and Status
    const getDetails = (email: string | null) => {
      if (!email || !accountByEmail.has(email)) return { id: null, status: null };
      const acct = accountByEmail.get(email)!;
      return { id: acct.account_id, status: attendance[acct.accountName] || 'Present' };
    };

    const m1 = getDetails(group.member1);
    const m2 = getDetails(group.member2);
    const m3 = getDetails(group.member3);
    const m4 = getDetails(group.member4);
    const m5 = getDetails(group.member5);

    const upsertPayload = {
      conID,
      oneID: m1.id, mem1: m1.status,
      twoID: m2.id, mem2: m2.status,
      threeID: m3.id, mem3: m3.status,
      fourID: m4.id, mem4: m4.status,
      fiveID: m5.id, mem5: m5.status
    };

    // Use conID as conflict resolution key if supported, otherwise update or insert
    const { data: existing } = await supabase.from('ss_attendance').select('attID').eq('conID', conID).single();

    if (existing) {
      await supabase.from('ss_attendance').update(upsertPayload).eq('conID', conID);
    } else {
      await supabase.from('ss_attendance').insert([upsertPayload]);
    }

    res.json({ message: "Attendance saved successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET existing participation record
app.get('/api/consultations/:id/participation', verifyInstructor, async (req, res) => {
  const conID = req.params.id;

  try {
    const { data: record, error } = await supabase
      .from('ss_participation')
      .select('*')
      .eq('conID', conID)
      .single();

    if (error || !record) return res.json(null);

    // Collect IDs
    const idList = [
      record.mem1, record.mem2, record.mem3, record.mem4, record.mem5
    ].filter(Boolean);

    if (idList.length === 0) return res.json({});

    // Fetch matching accounts to translate ID -> Name
    const { data: accounts } = await supabase
      .from('ss_account')
      .select('account_id, accountName')
      .in('account_id', idList);

    const accountMap = new Map(accounts?.map(a => [a.account_id, a.accountName]) || []);

    const participationMap: Record<string, string> = {};
    const extract = (idVal: number | null, ratingVal: string | null) => {
      if (idVal && accountMap.has(idVal)) {
        participationMap[accountMap.get(idVal)!] = ratingVal || 'Moderate';
      }
    };

    extract(record.mem1, record.part1);
    extract(record.mem2, record.part2);
    extract(record.mem3, record.part3);
    extract(record.mem4, record.part4);
    extract(record.mem5, record.part5);

    res.json(participationMap);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// UPSERT participation record
app.put('/api/consultations/:id/participation', verifyInstructor, async (req, res) => {
  const conID = req.params.id;
  const { groupName, participation } = req.body; // participation is Record<string, 'High' | 'Moderate' | 'Low'>

  if (!groupName || !participation) return res.status(400).json({ error: "Missing required properties." });

  try {
    // 1. Get Group Structure
    const { data: group } = await supabase
      .from('ss_group')
      .select('member1, member2, member3, member4, member5')
      .eq('groupName', groupName)
      .single();

    if (!group) return res.status(404).json({ error: "Linked group not found" });

    // 2. Map Emails to Account IDs via ss_account
    const emailList = [group.member1, group.member2, group.member3, group.member4, group.member5].filter(Boolean);
    const { data: accounts } = await supabase
      .from('ss_account')
      .select('account_id, accountEmail, accountName')
      .in('accountEmail', emailList);

    const accountByEmail = new Map(accounts?.map(a => [a.accountEmail, a]) || []);

    // Helper to get ID and Rating
    const getDetails = (email: string | null) => {
      if (!email || !accountByEmail.has(email)) return { id: null, rating: null };
      const acct = accountByEmail.get(email)!;
      return { id: acct.account_id, rating: participation[acct.accountName] || 'Moderate' };
    };

    const m1 = getDetails(group.member1);
    const m2 = getDetails(group.member2);
    const m3 = getDetails(group.member3);
    const m4 = getDetails(group.member4);
    const m5 = getDetails(group.member5);

    const upsertPayload = {
      conID,
      mem1: m1.id, part1: m1.rating,
      mem2: m2.id, part2: m2.rating,
      mem3: m3.id, part3: m3.rating,
      mem4: m4.id, part4: m4.rating,
      mem5: m5.id, part5: m5.rating
    };

    const { data: existing } = await supabase.from('ss_participation').select('partID').eq('conID', conID).single();

    if (existing) {
      await supabase.from('ss_participation').update(upsertPayload).eq('conID', conID);
    } else {
      await supabase.from('ss_participation').insert([upsertPayload]);
    }

    res.json({ message: "Participation saved successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

import axios from 'axios';
import { parse } from 'csv-parse/sync';

async function syncCourseGroupsFromSheet(courseId: string, sheetUrl: string, saveUrl: boolean = false) {
  const match = sheetUrl.match(/\/d\/(.*?)\//);
  if (!match || !match[1]) {
    throw new Error("Invalid Google Sheets link. Please ensure it is the full URL.");
  }
  const sheetId = match[1];

  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
  const response = await axios.get(csvUrl);
  const csvData = response.data;

  const records = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
  });

  const groupsMap: { [key: string]: string[] } = {};
  const updates = [];

  for (const row of records as any[]) {
    const email = row['Email']?.trim();
    const groupName = row['group']?.trim();

    if (email && groupName) {
      if (!groupsMap[groupName]) groupsMap[groupName] = [];
      groupsMap[groupName].push(email);

      const updatePromise = supabase
        .from('ss_account')
        .update({ accountGroup: groupName })
        .eq('accountEmail', email);
      updates.push(updatePromise);
    }
  }

  // Validate max 5 members per group
  for (const [groupName, members] of Object.entries(groupsMap)) {
    if (members.length > 5) {
      throw new Error(`Group '${groupName}' exceeds the maximum limit of 5 members.`);
    }
  }

  await Promise.all(updates);

  // If saveUrl is true, update the course with the sheetUrl so we can auto-sync it later
  if (saveUrl) {
    const { error: courseUpdateError } = await supabase
      .from('ss_courses')
      .update({ courseSheetUrl: sheetUrl })
      .eq('id', courseId);
    if (courseUpdateError) {
      console.error(`Failed to save sheetUrl for course ${courseId}:`, courseUpdateError);
    }
  }

  await supabase.from('ss_groupings').delete().eq('courseID', courseId);
  
  const existingGroupingsRes = await supabase.from('ss_groupings').select('groupName').eq('courseID', courseId);
  if (existingGroupingsRes.data && existingGroupingsRes.data.length > 0) {
     // NOTE: This logic seems flawed in original code because we just deleted everything for courseID above
     // but we'll try to delete related ss_group rows if we can match them. Just keeping logic similar for now.
     // In a production app, we'd probably want to make sure cascading deletes happen or use a safer transaction.
     // We will just replace it with looking at the names we are about to insert and overwriting them or deleting old ones.
  }
  
  // Actually, let's delete any group that belongs to this course's *old* groupings. 
  // Wait, we just deleted the groupings above, so we can't look them up. This was a bug in the old code.
  // Instead, let's just delete the groups based on the names in groupsMap since we know we are replacing them.
  const gNames = Object.keys(groupsMap);
  if (gNames.length > 0) {
    await supabase.from('ss_group').delete().in('groupName', gNames);
  }

  const groupingsInsert = [];
  const ssGroupInsert = [];

  for (const [groupName, members] of Object.entries(groupsMap)) {
    groupingsInsert.push({
      groupName: groupName,
      groupMembers: members.length.toString(),
      courseID: courseId
    });

    ssGroupInsert.push({
      groupName: groupName,
      member1: members[0] || null, roleOne: members[0] ? 'leader' : null,
      member2: members[1] || null, roleTwo: members[1] ? 'member' : null,
      member3: members[2] || null, roleThree: members[2] ? 'member' : null,
      member4: members[3] || null, roleFour: members[3] ? 'member' : null,
      member5: members[4] || null, roleFive: members[4] ? 'member' : null,
    });
  }

  if (groupingsInsert.length > 0) {
    const { error: groupErr } = await supabase.from('ss_groupings').insert(groupingsInsert);
    if (groupErr) throw new Error(`Grouping Insert Failed: ${groupErr.message}`);
  }

  if (ssGroupInsert.length > 0) {
    const { error: ssGroupErr } = await supabase.from('ss_group').insert(ssGroupInsert);
    if (ssGroupErr) throw new Error(`ss_group Insert Failed: ${ssGroupErr.message}`);
  }

  return Object.keys(groupsMap).length;
}

// Background auto-sync function. Runs every 10 minutes (600000ms).
setInterval(async () => {
  try {
    const { data: courses, error } = await supabase
      .from('ss_courses')
      .select('id, courseSheetUrl')
      .not('courseSheetUrl', 'is', null);

    if (error) {
      console.error("Auto-sync: Error fetching courses", error);
      return;
    }

    if (!courses || courses.length === 0) return;

    for (const course of courses) {
      if (course.courseSheetUrl) {
        try {
          await syncCourseGroupsFromSheet(course.id.toString(), course.courseSheetUrl, false);
          console.log(`Auto-synced groups for course ${course.id}`);
        } catch (err: any) {
          console.error(`Auto-sync failed for course ${course.id}:`, err?.message);
        }
      }
    }
  } catch (err) {
    console.error("Auto-sync: Unhandled error", err);
  }
}, 10 * 60 * 1000); // 10 minutes

app.post('/api/courses/:id/import-groups', verifyInstructor, async (req, res) => {
  const { sheetUrl } = req.body;
  const courseId = req.params.id;

  if (!sheetUrl) return res.status(400).json({ error: "Missing Google Sheets URL" });

  try {
    const groupCount = await syncCourseGroupsFromSheet(courseId as string, sheetUrl as string, true);
    return res.json({ success: true, message: `Successfully imported and saved Google Sheet for ${groupCount} groups!` });

  } catch (error: any) {
    if (error?.response?.status === 404 || error?.response?.status === 403) {
      return res.status(400).json({ error: "Cannot access this Sheet. Please ensure 'Anyone with the link' can View it!" });
    }
    return res.status(500).json({ error: error?.message || "Failed to parse spreadsheet." });
  }
});

app.post('/api/courses/:id/sync-groups', verifyInstructor, async (req, res) => {
  const courseId = req.params.id;

  try {
    // Fetch the URL from db
    const { data: course, error } = await supabase
      .from('ss_courses')
      .select('courseSheetUrl')
      .eq('id', courseId)
      .single();

    if (error || !course || !course.courseSheetUrl) {
      return res.status(404).json({ error: "No Google Sheet linked to this course. Please import one first." });
    }

    const groupCount = await syncCourseGroupsFromSheet(courseId as string, course.courseSheetUrl as string, false);
    return res.json({ success: true, message: `Successfully synchronized ${groupCount} groups with the linked Google Sheet!` });

  } catch (error: any) {
    if (error?.response?.status === 404 || error?.response?.status === 403) {
      return res.status(400).json({ error: "Cannot access this Sheet. Please ensure 'Anyone with the link' can View it!" });
    }
    return res.status(500).json({ error: error?.message || "Failed to parse spreadsheet." });
  }
});

app.post('/api/courses/:id/groups', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  const courseId = req.params.id;
  const { groupName, members } = req.body; // members is array of emails, max 5, index 0 is leader

  if (!groupName || !members || !Array.isArray(members) || members.length === 0) {
    return res.status(400).json({ error: "Missing groupName or members" });
  }

  if (members.length > 5) {
    return res.status(400).json({ error: "A group can have a maximum of 5 members" });
  }

  try {
    jwt.verify(token as string, process.env.JWT_SECRET || "test");

    // Insert to ss_groupings
    const { error: groupingErr } = await supabase
      .from('ss_groupings')
      .insert([{
        groupName,
        groupMembers: members.length.toString(),
        courseID: courseId
      }]);
    
    if (groupingErr) throw groupingErr;

    // Insert to ss_group
    const { data: newGroup, error: ssGroupErr } = await supabase
      .from('ss_group')
      .insert([{
        groupName,
        member1: members[0] || null, roleOne: members[0] ? 'leader' : null,
        member2: members[1] || null, roleTwo: members[1] ? 'member' : null,
        member3: members[2] || null, roleThree: members[2] ? 'member' : null,
        member4: members[3] || null, roleFour: members[3] ? 'member' : null,
        member5: members[4] || null, roleFive: members[4] ? 'member' : null,
      }])
      .select()
      .single();

    if (ssGroupErr) throw ssGroupErr;

    // Optional: Update user profiles with the new group assigned
    for (const email of members) {
      if (email) {
        await supabase.from('ss_account').update({ accountGroup: groupName }).eq('accountEmail', email);
      }
    }

    res.json(newGroup);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message || "Failed to create group" });
  }
});

// Group Endpoints for Detailed View & Tasks
app.get('/api/groups/:id', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || "test");
    const groupingId = req.params.id;

    // 1. Fetch the group name from ss_groupings using the ID from the URL
    const { data: grouping, error: groupingError } = await supabase
      .from('ss_groupings')
      .select('groupName')
      .eq('groupID', groupingId)
      .single();
    
    if (groupingError || !grouping) {
      return res.status(404).json({ error: "Group reference not found" });
    }

    // 2. Fetch the actual group details from ss_group using the groupName
    const { data, error } = await supabase
      .from('ss_group')
      .select('*')
      .eq('groupName', grouping.groupName)
      .single();

    if (error) return res.status(404).json({ error: "Group details not found" });
    res.json(data);
  } catch (err) {
    res.sendStatus(403);
  }
});

app.get('/api/groups/:id/tasks', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || "test");
    const groupingId = req.params.id;

    // Find smallgroupID for task linking
    const { data: grouping } = await supabase.from('ss_groupings').select('groupName').eq('groupID', groupingId).single();
    if (!grouping) return res.status(404).json({ error: "Group reference not found" });
    
    const { data: group } = await supabase.from('ss_group').select('smallgroupID').eq('groupName', grouping.groupName).single();
    if (!group) return res.status(404).json({ error: "Group details not found" });

    const { data, error } = await supabase
      .from('ss_grouptasks')
      .select('*')
      .eq('groupID', group.smallgroupID);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.sendStatus(403);
  }
});

app.get('/api/groups/by-name/:name/tasks', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || "test");
    const groupName = req.params.name;

    const { data: group } = await supabase
      .from('ss_group')
      .select('smallgroupID')
      .eq('groupName', groupName)
      .single();
      
    if (!group) return res.status(404).json({ error: "Group details not found" });

    const { data, error } = await supabase
      .from('ss_grouptasks')
      .select('*')
      .eq('groupID', group.smallgroupID);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data || []);
  } catch (err) {
    res.sendStatus(403);
  }
});

app.post('/api/groups/:id/tasks', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || "test");
    const groupingId = req.params.id;
    const { taskTitle, taskAssign, taskDeadline, taskInfo } = req.body;

    if (!taskTitle || !taskAssign || !taskDeadline) {
      return res.status(400).json({ error: "Missing required task fields" });
    }

    // Find smallgroupID for task linking
    const { data: grouping } = await supabase.from('ss_groupings').select('groupName').eq('groupID', groupingId).single();
    if (!grouping) return res.status(404).json({ error: "Group reference not found" });
    
    const { data: group } = await supabase.from('ss_group').select('smallgroupID').eq('groupName', grouping.groupName).single();
    if (!group) return res.status(404).json({ error: "Group details not found" });

    const { data, error } = await supabase
      .from('ss_grouptasks')
      .insert([{
        groupID: group.smallgroupID,
        taskTitle,
        taskAssign,
        taskDeadline,
        taskInfo
      }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (err) {
    res.sendStatus(403);
  }
});

app.post('/api/courses', verifyInstructor, async (req, res) => {
  const { courseName, courseCode, courseSection, courseTerm } = req.body;
  const user = (req as any).user;

  if (!courseName || !courseCode || !courseSection || !courseTerm) {
    return res.status(400).json({ error: "Missing course details" });
  }

  // Generate 8-character random alphanumeric key
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let courseKey = '';
  for (let i = 0; i < 8; i++) {
    courseKey += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  const { data, error } = await supabase
    .from('ss_courses')
    .insert([{
      courseName,
      courseCode,
      courseSection,
      courseTerm,
      courseKey,
      courseAmount: 0,
      courseAdviser: user.email // Associate with the creator
    }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/enroll', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  const { courseKey } = req.body;
  if (!courseKey) return res.status(400).json({ error: "Missing course key" });

  try {
    const user: any = jwt.verify(token, process.env.JWT_SECRET || "test");

    // 1. Find the course matching the key
    const { data: course, error: fetchError } = await supabase
      .from('ss_courses')
      .select('id, courseAmount')
      .eq('courseKey', courseKey)
      .single();

    if (fetchError || !course) {
      return res.status(404).json({ error: "Invalid course key" });
    }

    // 2. Insert enrollment record
    const { error: enrollError } = await supabase
      .from('ss_enrollments')
      .insert([{
        account_id: user.id,
        course_id: course.id
      }]);

    // Handle uniqueness constraints if Student already joined (Assuming composite unique key on DB)
    if (enrollError) {
      if (enrollError.code === '23505') { // Code for unique_violation
        return res.status(400).json({ error: "You are already enrolled in this course." });
      }
      return res.status(500).json({ error: enrollError.message });
    }

    // 3. Increment course member amount visually
    await supabase
      .from('ss_courses')
      .update({ courseAmount: course.courseAmount + 1 })
      .eq('id', course.id);

    return res.json({ success: true, message: "Successfully enrolled!" });

  } catch (err) {
    return res.status(401).json({ error: "Invalid session token" });
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

// Global error handler to catch OAuth token errors
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Express Error:', err.message || err);
  if (err.name === 'TokenError') {
    // If authorization fails (e.g. wrong client secret or expired code), redirect back with error
    return res.redirect('http://localhost:3000/login?error=GoogleAuthFailed');
  }
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});