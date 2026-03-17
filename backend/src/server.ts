import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import 'dotenv/config';
import { GoogleDocsService } from './googleDocsService.js';
import fs from 'fs';
import { GoogleGenerativeAI } from "@google/generative-ai";
import aiRoutes from './routes/ai.routes.js';
import db from './Config/supabaseconfig.js';

console.log("DEBUG: JWT_SECRET from env:", process.env.JWT_SECRET);

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);
const JWT_SECRET = process.env.JWT_SECRET || "test";
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const app = express();

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use('/api/ai', aiRoutes);

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
    // Instructor = Admin or Adviser
    if (
      user.role !== 'Admin' &&
      user.role !== 'Adviser'
    ) {
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

    if (user.role === 'Admin' || user.role === 'Adviser') {
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
  const { conDate, conType, conMil, conSum, isDraft, conStat, groupName, conNotes } = req.body;

  if (!conDate || !conType || !conMil || !groupName) {
    return res.status(400).json({ error: "Missing required consultation details" });
  }

  let attendeesStr = '';
  let actionsStr = '';

  if (groupName) {
    // Build attendees list based on the ss_group membership, so that
    // the leader (real student) is always included even if accountGroup
    // was not set correctly.
    const { data: groupRows } = await supabase
      .from('ss_group')
      .select('member1, member2, member3, member4, member5')
      .eq('groupName', groupName);

    const groupRow = groupRows?.[0];
    const memberEmails = groupRow
      ? [groupRow.member1, groupRow.member2, groupRow.member3, groupRow.member4, groupRow.member5].filter(Boolean)
      : [];

    if (memberEmails.length > 0) {
      const { data: accounts } = await supabase
        .from('ss_account')
        .select('accountName, accountEmail')
        .in('accountEmail', memberEmails as string[]);

      const nameByEmail = new Map<string, string>();
      (accounts || []).forEach(a => {
        if (a.accountEmail) {
          nameByEmail.set(a.accountEmail, a.accountName || a.accountEmail);
        }
      });

      const orderedNames = (memberEmails as string[]).map(email =>
        nameByEmail.get(email) || email
      );

      attendeesStr = orderedNames.join(', ');
    } else {
      // Fallback: use accountGroup mapping if ss_group row was not found
      const { data: students } = await supabase
        .from('ss_account')
        .select('accountName')
        .eq('accountGroup', groupName);

      if (students && students.length > 0) {
        attendeesStr = students.map(s => s.accountName).join(', ');
      }
    }

    // Fetch tasks for the group to auto-populate conAction
    const { data: groups } = await supabase
      .from('ss_group')
      .select('smallgroupID')
      .eq('groupName', groupName);
    const group = groups?.[0];
    if (group) {
      const { data: tasks } = await supabase
        .from('ss_grouptasks')
        .select('taskTitle')
        .eq('groupId', group.smallgroupID);
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
      conStat: conStat || 'On Track',
      conNotes: conNotes || ''
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

const parseId = (id: string) => {
  const parsed = parseInt(id, 10);
  if (isNaN(parsed)) throw new Error("Invalid ID format");
  return parsed;
};

// UPDATE consultation
app.put('/api/consultations/:id', verifyInstructor, async (req: express.Request, res: express.Response) => {
  try {
    const conID = parseId(req.params.id);
    const { conDate, conType, conMil, conSum, conAction, isDraft, conStat, groupName, conNotes } = req.body;

    const { data, error } = await supabase
      .from('ss_consultation')
      .update({ conDate, conType, conMil, conSum, conAction, isDraft, conStat, groupName, conNotes })
      .eq('conID', conID)
      .select()
      .single();

    if (error) throw error;

    if (data && !data.isDraft) {
      try {
        await (global as any).GoogleDocsService.archiveConsultation(data, (req as any).user.email);
      } catch (archiveError) {
        console.error("Archive failed:", archiveError);
      }
    }
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET attendance
app.get('/api/consultations/:id/attendance', verifyInstructor, async (req, res) => {
  try {
    const conID = parseId(req.params.id);
    const { data: record, error } = await supabase
      .from('ss_attendance')
      .select('*')
      .eq('conID', conID)
      .maybeSingle();

    if (error || !record) return res.json(null);
    
    // Schema columns are one_id, two_id, ... not oneID, etc.
    const idList = [record.one_id, record.two_id, record.three_id, record.four_id, record.five_id].filter(Boolean);
    const { data: accounts } = await supabase.from('ss_account').select('account_id, accountName').in('account_id', idList);
    const accountMap = new Map(accounts?.map(a => [a.account_id, a.accountName]) || []);
    const attendanceMap: Record<string, string> = {};
    
    const extract = (id: number | null, status: string | null) => {
      if (id && accountMap.has(id)) attendanceMap[accountMap.get(id)!] = status || 'Present';
    };
    extract(record.one_id, record.mem1);
    extract(record.two_id, record.mem2);
    extract(record.three_id, record.mem3);
    extract(record.four_id, record.mem4);
    extract(record.five_id, record.mem5);

    res.json(attendanceMap);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// UPSERT attendance
app.put('/api/consultations/:id/attendance', verifyInstructor, async (req, res) => {
  try {
    const conID = parseId(req.params.id);
    const { groupName, attendance } = req.body;

    const { data: group } = await supabase.from('ss_group').select('member1, member2, member3, member4, member5').eq('groupName', groupName).single();
    if (!group) return res.status(404).json({ error: "Linked group not found" });

    const emailList = [group.member1, group.member2, group.member3, group.member4, group.member5].filter(Boolean);
    const { data: accounts } = await supabase.from('ss_account').select('account_id, accountEmail, accountName').in('accountEmail', emailList);
    const accountByEmail = new Map(accounts?.map(a => [a.accountEmail, a]) || []);
    
    const getDetails = (email: string | null) => {
      if (!email || !accountByEmail.has(email)) return { id: null, status: null };
      const acct = accountByEmail.get(email)!;
      return { id: acct.account_id, status: attendance[acct.accountName] || 'Present' };
    };

    const upsertPayload = {
      conID,
      one_id: getDetails(group.member1).id, mem1: getDetails(group.member1).status,
      two_id: getDetails(group.member2).id, mem2: getDetails(group.member2).status,
      three_id: getDetails(group.member3).id, mem3: getDetails(group.member3).status,
      four_id: getDetails(group.member4).id, mem4: getDetails(group.member4).status,
      five_id: getDetails(group.member5).id, mem5: getDetails(group.member5).status
    };

    const { data: existing, error: existingErr } = await supabase
      .from('ss_attendance')
      .select('att_id')
      .eq('conID', conID)
      .maybeSingle();

    if (!existingErr && existing) {
      await supabase.from('ss_attendance').update(upsertPayload).eq('conID', conID);
    } else {
      await supabase.from('ss_attendance').insert([upsertPayload]);
    }

    res.json({ message: "Attendance saved" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET participation
app.get('/api/consultations/:id/participation', verifyInstructor, async (req, res) => {
  try {
    const conID = parseId(req.params.id);
    const { data: record, error } = await supabase.from('ss_participation').select('*').eq('conID', conID).single();
    if (error || !record) return res.json(null);
    
    const idList = [record.mem1, record.mem2, record.mem3, record.mem4, record.mem5].filter(Boolean);
    const { data: accounts } = await supabase.from('ss_account').select('account_id, accountName').in('account_id', idList);
    const accountMap = new Map(accounts?.map(a => [a.account_id, a.accountName]) || []);
    const participationMap: Record<string, string> = {};
    
    const extract = (id: number | null, rating: string | null) => {
        if (id && accountMap.has(id)) participationMap[accountMap.get(id)!] = rating || 'Moderate';
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

// UPSERT participation
app.put('/api/consultations/:id/participation', verifyInstructor, async (req, res) => {
  try {
    const conID = parseId(req.params.id);
    const { groupName, participation } = req.body;

    const { data: group } = await supabase.from('ss_group').select('member1, member2, member3, member4, member5').eq('groupName', groupName).single();
    if (!group) return res.status(404).json({ error: "Linked group not found" });

    const emailList = [group.member1, group.member2, group.member3, group.member4, group.member5].filter(Boolean);
    const { data: accounts } = await supabase.from('ss_account').select('account_id, accountEmail, accountName').in('accountEmail', emailList);
    const accountByEmail = new Map(accounts?.map(a => [a.accountEmail, a]) || []);
    
    const getDetails = (email: string | null) => {
      if (!email || !accountByEmail.has(email)) return { id: null, rating: null };
      const acct = accountByEmail.get(email)!;
      return { id: acct.account_id, rating: participation[acct.accountName] || 'Moderate' };
    };

    const upsertPayload = {
      conID,
      mem1: getDetails(group.member1).id, part1: getDetails(group.member1).rating,
      mem2: getDetails(group.member2).id, part2: getDetails(group.member2).rating,
      mem3: getDetails(group.member3).id, part3: getDetails(group.member3).rating,
      mem4: getDetails(group.member4).id, part4: getDetails(group.member4).rating,
      mem5: getDetails(group.member5).id, part5: getDetails(group.member5).rating
    };

    const { data: existing, error: existingErr } = await supabase
      .from('ss_participation')
      .select('part_id')
      .eq('conID', conID)
      .maybeSingle();

    if (!existingErr && existing) {
      await supabase.from('ss_participation').update(upsertPayload).eq('conID', conID);
    } else {
      await supabase.from('ss_participation').insert([upsertPayload]);
    }

    res.json({ message: "Participation saved" });
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
  console.log(`[SYNC] Fetched CSV from Google Sheets. Length: ${csvData?.length || 0}`);

  const records = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
  });

  const groupsMap: { [key: string]: string[] } = {};
  const accountUpdates = [];

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
      accountUpdates.push(updatePromise);
    }
  }

  console.log(`[SYNC] Parsed ${Object.keys(groupsMap).length} groups from CSV.`);

  // Validate max 5 members per group
  for (const [groupName, members] of Object.entries(groupsMap)) {
    if (members.length > 5) {
      throw new Error(`Group '${groupName}' exceeds the maximum limit of 5 members.`);
    }
  }

  await Promise.all(accountUpdates);

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

  // STABLE SYNC LOGIC:
  // 1. Fetch existing groupings for this course
  const { data: existingGroupings, error: fetchErr } = await supabase
    .from('ss_groupings')
    .select('groupName, groupID')
    .eq('courseID', courseId);
  
  if (fetchErr) throw new Error(`Failed to fetch current groupings: ${fetchErr.message}`);
  console.log(`[SYNC] Found ${existingGroupings?.length || 0} existing groupings in DB.`);

  // DEDUPLICATION: Map names to all their IDs to detect current corruption
  const nameToIds = new Map<string, number[]>();
  existingGroupings?.forEach(g => {
    const ids = nameToIds.get(g.groupName) || [];
    ids.push(g.groupID);
    nameToIds.set(g.groupName, ids);
  });

  const idsToCleanup = [];
  const groupNameToStableId = new Map<string, number>();

  for (const [name, ids] of nameToIds.entries()) {
    const sortedIds = ids.sort((a, b) => a - b);
    const stableId = sortedIds[0];
    if (stableId !== undefined) {
      groupNameToStableId.set(name, stableId);
    }
    if (sortedIds.length > 1) {
      idsToCleanup.push(...sortedIds.slice(1));
    }
  }

  const groupingsToSync = Object.keys(groupsMap);
  const existingGroupingNames = new Set(groupNameToStableId.keys());
  const groupingsToDelete = Array.from(existingGroupingNames).filter(name => !groupsMap[name]);

  // 2. Perform ss_groupings Sync
  for (const groupName of groupingsToSync) {
    const members = groupsMap[groupName];
    if (!members) continue;
    
    const payload = {
      groupName: groupName,
      groupMembers: members.length.toString(),
      courseID: courseId
    };

    if (groupNameToStableId.has(groupName)) {
      // Update existing stable record
      const stableId = groupNameToStableId.get(groupName);
      if (stableId !== undefined) {
        await supabase.from('ss_groupings').update(payload).eq('groupID', stableId);
      }
    } else {
      // Insert new
      await supabase.from('ss_groupings').insert([payload]);
    }
  }

  // 3. Perform ss_group Sync
  // Fetch existing groups by name to find their IDs
  const { data: existingGroups } = await supabase
    .from('ss_group')
    .select('groupName, smallgroupID')
    .in('groupName', groupingsToSync);
  
  const groupNameToDetailsId = new Map<string, number>();
  const detailsIdsToCleanup: number[] = [];

  existingGroups?.forEach(g => {
    if (groupNameToDetailsId.has(g.groupName)) {
      detailsIdsToCleanup.push(g.smallgroupID);
    } else {
      groupNameToDetailsId.set(g.groupName, g.smallgroupID);
    }
  });

  for (const groupName of groupingsToSync) {
    const members = groupsMap[groupName];
    if (!members) continue;
    const payload = {
      groupName: groupName,
      member1: members[0] || null, roleOne: members[0] ? 'leader' : null,
      member2: members[1] || null, roleTwo: members[1] ? 'member' : null,
      member3: members[2] || null, roleThree: members[2] ? 'member' : null,
      member4: members[3] || null, roleFour: members[3] ? 'member' : null,
      member5: members[4] || null, roleFive: members[4] ? 'member' : null,
    };

    if (groupNameToDetailsId.has(groupName)) {
      const smallgroupID = groupNameToDetailsId.get(groupName);
      await supabase.from('ss_group').update(payload).eq('smallgroupID', smallgroupID);
    } else {
      await supabase.from('ss_group').insert([payload]);
    }
  }

  if (detailsIdsToCleanup.length > 0) {
    await supabase.from('ss_group').delete().in('smallgroupID', detailsIdsToCleanup);
  }

  // 4. Cleanup old records and duplicates
  if (groupingsToDelete.length > 0) {
    // Safety: only delete from ss_group if NO OTHER course is using this name
    const { data: otherGroupings } = await supabase
      .from('ss_groupings')
      .select('groupName')
      .in('groupName', groupingsToDelete)
      .neq('courseID', courseId);
    
    const namesToKeep = new Set(otherGroupings?.map(g => g.groupName) || []);
    const namesToRemoveFromDetails = groupingsToDelete.filter(name => !namesToKeep.has(name));

    await supabase.from('ss_groupings').delete().eq('courseID', courseId).in('groupName', groupingsToDelete);
    
    if (namesToRemoveFromDetails.length > 0) {
      await supabase.from('ss_group').delete().in('groupName', namesToRemoveFromDetails);
    }
  }
  
  if (idsToCleanup.length > 0) {
    await supabase.from('ss_groupings').delete().in('groupID', idsToCleanup);
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
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, JWT_SECRET);
    const groupingId = Number(req.params.id);

    const { data: grouping, error: groupingError } = await supabase
      .from('ss_groupings')
      .select('groupName')
      .eq('groupID', groupingId)
      .single();

    if (groupingError || !grouping?.groupName) {
      return res.status(404).json({ error: "Group not found" });
    }

    const { data: groups, error } = await supabase
      .from('ss_group')
      .select('*')
      .eq('groupName', grouping.groupName)
      .single();

    if (error) throw error;
    res.json(groups);
  } catch (err: any) {
    console.error("DEBUG - Group fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch group details" });
  }
});

app.get('/api/groups/:id/tasks', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || "test");
    const groupingId = Number(req.params.id);

    if (isNaN(groupingId)) {
      return res.status(400).json({ error: "Invalid group ID format" });
    }

    // Find smallgroupID for task linking
    const { data: grouping } = await supabase.from('ss_groupings').select('groupName').eq('groupID', groupingId).single();
    if (!grouping) return res.status(404).json({ error: "Group reference not found" });
    
    const { data: groups } = await supabase.from('ss_group').select('smallgroupID').eq('groupName', grouping.groupName);
    const group = groups?.[0];
    if (!group) return res.status(404).json({ error: "Group details not found" });
    
    // Fallback log if multiple found
    if (groups && groups.length > 1) {
      console.warn(`[DEBUG] Multiple group details found for "${grouping.groupName}" in task GET`);
    }

    const { data, error } = await supabase
      .from('ss_grouptasks')
      .select('*')
      .eq('groupId', group.smallgroupID)
      .eq('archived', false);

    if (error) {
      console.error(`[DEBUG] Error fetching tasks for group ${group.smallgroupID}:`, error);
      return res.status(500).json({ error: `Failed to fetch tasks: ${error.message}` });
    }

    // Process comments to include dates
    const processedData = (data || []).map(task => {
      let comments = [];
      try {
        if (task.comments) {
          if (typeof task.comments === 'string') {
            comments = JSON.parse(task.comments);
          } else if (Array.isArray(task.comments)) {
            comments = task.comments;
          } else {
            comments = [{ text: task.comments, date: new Date().toISOString() }];
          }
        }
      } catch (e) {
        // If parsing fails, treat as legacy string
        comments = [{ text: task.comments || '', date: new Date().toISOString() }];
      }
      return {
        ...task,
        comments: comments
      };
    });

    res.json(processedData);
  } catch (err) {
    res.sendStatus(403);
  }
});

// GET archived tasks for a group
app.get('/api/groups/:id/tasks/archived', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || "test");
    const groupingId = Number(req.params.id);

    if (isNaN(groupingId)) {
      return res.status(400).json({ error: "Invalid group ID format" });
    }

    // Find smallgroupID for task linking
    const { data: grouping } = await supabase.from('ss_groupings').select('groupName').eq('groupID', groupingId).single();
    if (!grouping) return res.status(404).json({ error: "Group reference not found" });
    
    const { data: groups } = await supabase.from('ss_group').select('smallgroupID').eq('groupName', grouping.groupName);
    const group = groups?.[0];
    if (!group) return res.status(404).json({ error: "Group details not found" });
    
    // Fallback log if multiple found
    if (groups && groups.length > 1) {
      console.warn(`[DEBUG] Multiple group details found for "${grouping.groupName}" in archived task GET`);
    }

    const { data, error } = await supabase
      .from('ss_grouptasks')
      .select('*')
      .eq('groupId', group.smallgroupID)
      .eq('archived', true);

    if (error) {
      console.error(`[DEBUG] Error fetching archived tasks for group ${group.smallgroupID}:`, error);
      return res.status(500).json({ error: `Failed to fetch archived tasks: ${error.message}` });
    }

    // Process comments to include dates
    const processedData = (data || []).map(task => {
      let comments = [];
      try {
        if (task.comments) {
          if (typeof task.comments === 'string') {
            comments = JSON.parse(task.comments);
          } else if (Array.isArray(task.comments)) {
            comments = task.comments;
          } else {
            comments = [{ text: task.comments, date: new Date().toISOString() }];
          }
        }
      } catch (e) {
        // If parsing fails, treat as legacy string
        comments = [{ text: task.comments || '', date: new Date().toISOString() }];
      }
      return {
        ...task,
        comments: comments
      };
    });

    res.json(processedData);
  } catch (err) {
    res.sendStatus(403);
  }
});

// Member Journals for a group
app.post('/api/groups/:id/journals', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, JWT_SECRET);
    const groupingId = Number(req.params.id);
    const {
      courseId,
      groupName,
      memberEmail,
      journalDate,
      taskUpdates,
      actionPlans,
      issues,
      minutes
    } = req.body;

    if (!courseId || !groupName || !memberEmail || !journalDate) {
      return res.status(400).json({ error: "Missing required journal fields" });
    }

    // Optional safety: ensure the grouping ID matches the groupName
    const { data: grouping } = await supabase
      .from('ss_groupings')
      .select('groupName, courseID')
      .eq('groupID', groupingId)
      .maybeSingle();

    if (!grouping || grouping.groupName !== groupName) {
      return res.status(404).json({ error: "Group not found for this journal" });
    }

    const { data, error } = await supabase
      .from('ss_member_journals')
      .insert([{
        courseID: courseId,
        groupName,
        member_email: memberEmail,
        journal_date: journalDate,
        task_updates: taskUpdates || [],
        action_plans: actionPlans || [],
        issues: issues || [],
        minutes_date: minutes?.dateOfConsultation || null,
        minutes_adviser: minutes?.adviser || null,
        minutes_key_points: minutes?.keyDiscussionPoints || null,
        minutes_action_items: minutes?.actionItems || null,
        minutes_action_deadlines: minutes?.actionDeadlines || null,
        next_consultation: minutes?.nextConsultation || null
      }])
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (err: any) {
    console.error("Member journal error:", err.message);
    res.status(500).json({ error: err.message || "Failed to save member journal" });
  }
});

app.get('/api/groups/by-name/:name/tasks', async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    jwt.verify(token, process.env.JWT_SECRET || "test");
    const groupName = req.params.name;

    const { data: groups } = await supabase
      .from('ss_group')
      .select('smallgroupID')
      .eq('groupName', groupName);
      
    const group = groups?.[0];
    if (!group) return res.status(404).json({ error: `Group details not found for name "${groupName}"` });

    const { data, error } = await supabase
      .from('ss_grouptasks')
      .select('*')
      .eq('groupId', group.smallgroupID);

    if (error) {
       console.error(`[DEBUG] Error fetching tasks for group name ${groupName}:`, error);
       return res.status(500).json({ error: `Failed to fetch tasks: ${error.message}` });
    }
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
    const groupingId = Number(req.params.id);

    if (isNaN(groupingId)) {
      return res.status(400).json({ error: "Invalid group ID format" });
    }

    const { taskTitle, taskAssign, taskDeadline, taskInfo } = req.body;

    if (!taskTitle || !taskAssign || !taskDeadline) {
      return res.status(400).json({ error: "Missing required task fields" });
    }

    // Find smallgroupID for task linking
    const { data: grouping } = await supabase.from('ss_groupings').select('groupName').eq('groupID', groupingId).single();
    if (!grouping) return res.status(404).json({ error: "Group reference not found" });
    
    const { data: groups } = await supabase.from('ss_group').select('smallgroupID').eq('groupName', grouping.groupName);
    const group = groups?.[0];
    if (!group) return res.status(404).json({ error: "Group details not found" });
    
    // Fallback log if multiple found
    if (groups && groups.length > 1) {
      console.warn(`[DEBUG] Multiple group details found for "${grouping.groupName}" in task POST`);
    }

    const { data, error } = await supabase
      .from('ss_grouptasks')
      .insert([{
        groupId: group.smallgroupID,
        taskTitle,
        taskAssign,
        taskDeadline,
        taskInfo
      }])
      .select()
      .single();

    if (error) {
      console.error("[DEBUG] Error creating task:", error);
      return res.status(500).json({ error: `Failed to create task: ${error.message}` });
    }
    res.json(data);
  } catch (err) {
    res.sendStatus(403);
  }
});

app.put('/api/groups/:id/tasks/:taskId', verifyInstructor, async (req, res) => {
  const groupingId = Number(req.params.id);
  const taskId = Number(req.params.taskId);
  const user = (req as any).user;

  if (isNaN(groupingId) || isNaN(taskId)) {
    return res.status(400).json({ error: "Invalid group ID or task ID format" });
  }

  const { taskTitle, taskAssign, taskDeadline, taskInfo, progressRating, comments, completed } = req.body;

  // Validate progressRating if provided
  if (progressRating !== undefined && (progressRating < 1 || progressRating > 5)) {
    return res.status(400).json({ error: "Progress rating must be between 1 and 5" });
  }

  // Build update object
  const updateData: any = {};
  if (taskTitle !== undefined) updateData.taskTitle = taskTitle;
  if (taskAssign !== undefined) updateData.taskAssign = taskAssign;
  if (taskDeadline !== undefined) updateData.taskDeadline = taskDeadline;
  if (taskInfo !== undefined) updateData.taskInfo = taskInfo;
  if (progressRating !== undefined) updateData.progressRating = progressRating;
  if (comments !== undefined) {
    // Store comments as JSON string in TEXT column
    if (typeof comments === 'string') {
      updateData.comments = JSON.stringify([{ text: comments, date: new Date().toISOString() }]);
    } else {
      // Ensure it's stored as JSON string, even if empty array
      const commentsArray = Array.isArray(comments) ? comments : [comments];
      updateData.comments = JSON.stringify(commentsArray);
    }
  }
  if (completed !== undefined) {
    updateData.completed = completed;
    // Archive the task when it's marked as completed
    if (completed) {
      updateData.archived = true;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  try {
    // First, get the correct groupId for this task
    const { data: taskData } = await supabase
      .from('ss_grouptasks')
      .select('groupId')
      .eq('taskID', taskId)
      .single();

    if (!taskData) {
      return res.status(404).json({ error: "Task not found" });
    }

    // Verify the task belongs to the requested group
    const { data: grouping } = await supabase.from('ss_groupings').select('groupName').eq('groupID', groupingId).single();
    if (!grouping) return res.status(404).json({ error: "Group reference not found" });
    
    const { data: groups } = await supabase.from('ss_group').select('smallgroupID').eq('groupName', grouping.groupName);
    const group = groups?.[0];
    if (!group) return res.status(404).json({ error: "Group details not found" });

    if (taskData.groupId !== group.smallgroupID) {
      return res.status(403).json({ error: "Task does not belong to this group" });
    }

    const { data, error } = await supabase
      .from('ss_grouptasks')
      .update(updateData)
      .eq('taskID', taskId)
      .select()
      .single();

    if (error) {
      console.error("[DEBUG] Error updating task:", error);
      return res.status(500).json({ error: `Failed to update task: ${error.message}` });
    }
    res.json(data);
  } catch (err) {
    console.error("[DEBUG] Error in task update:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete('/api/groups/:id/tasks/:taskId', verifyInstructor, async (req, res) => {
  const groupingId = Number(req.params.id);
  const taskId = Number(req.params.taskId);
  const user = (req as any).user;

  if (isNaN(groupingId) || isNaN(taskId)) {
    return res.status(400).json({ error: "Invalid group ID or task ID format" });
  }

  try {
    // First verify the task belongs to the group
    const groupData = await supabase.from('ss_group').select('smallgroupID').eq('groupName', (await supabase.from('ss_groupings').select('groupName').eq('groupID', groupingId).single()).data?.groupName).single();
    if (!groupData.data) {
      return res.status(404).json({ error: "Group not found" });
    }

    const { data, error } = await supabase
      .from('ss_grouptasks')
      .delete()
      .eq('taskID', taskId)
      .eq('groupId', groupData.data.smallgroupID);

    if (error) {
      console.error("[DEBUG] Error deleting task:", error);
      return res.status(500).json({ error: `Failed to delete task: ${error.message}` });
    }
    res.json({ message: "Task deleted successfully" });
  } catch (err) {
    console.error("[DEBUG] Error in task delete:", err);
    res.status(500).json({ error: "Internal server error" });
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

app.post("/api/ai/summary", async (req, res) => {
  // DEBUG: Check what the user role is
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];
  
  if (token === "test") {
    // Bypass for testing
    console.log("DEBUG: Using test bypass");
  } else {
    // Real auth check logic
  }

  try {
    const { context } = req.body;
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(`Summarize: ${context}`);
    res.json({ summary: result.response.text() });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});