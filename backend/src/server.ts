import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import 'dotenv/config';

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
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      const name = profile.displayName;
      const googleId = profile.id;

      if (!email) {
        return done(new Error("No email found from Google profile"));
      }

      const { data: user, error } = await supabase
        .from('ss_account')
        .select('*')
        .eq('accountEmail', email)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is 'No rows found'
        throw new Error(error.message);
      }

      if (!user) {
        // User does not exist, pass the email forward via a temporary object
        return done(null, { isNew: true, email: email } as any);
      }

      // Generate random account_id for legacy/JWT compatibility if not present (assuming UUID typically)
      // We pass the existing user directly
      return done(null, { ...user, id: user.account_id, email: user.accountEmail } as any);

      return done(null, user);
    } catch (err) {
      return done(err as Error);
    }
  }
));

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
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
    jwt.verify(token, process.env.JWT_SECRET || "test");
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
    jwt.verify(token, process.env.JWT_SECRET || "test");
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
    jwt.verify(token, process.env.JWT_SECRET || "test");
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

import axios from 'axios';
import { parse } from 'csv-parse/sync';

app.post('/api/courses/:id/import-groups', verifyInstructor, async (req, res) => {
  const { sheetUrl } = req.body;
  const courseId = req.params.id;

  if (!sheetUrl) return res.status(400).json({ error: "Missing Google Sheets URL" });

  try {
    // 1. Extract the actual Google Sheet ID from URL (Format: https://docs.google.com/spreadsheets/d/{ID}/edit)
    const match = sheetUrl.match(/\/d\/(.*?)\//);
    if (!match || !match[1]) {
      return res.status(400).json({ error: "Invalid Google Sheets link. Please ensure it is the full URL." });
    }
    const sheetId = match[1];

    // 2. Fetch the raw CSV data using Google's open export API
    const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    const response = await axios.get(csvUrl);
    const csvData = response.data;

    // 3. Parse CSV mapping Headers to Object Keys (Throws if CSV is improperly formatted)
    const records = parse(csvData, {
      columns: true,
      skip_empty_lines: true,
    });

    // We expect headers: Full name, Email, group. 
    // Build a map of groups and count their members simultaneously
    const groupCounts: { [key: string]: number } = {};
    const updates = [];

    // 4. Update the account profiles iteratively based on the Email column mapping to their Group
    for (const row of records as any[]) {
      // Keys are exact to user prompt: row['Email'], row['group']
      const email = row['Email']?.trim();
      const groupName = row['group']?.trim();

      if (email && groupName) {
        // Track the total size of this unique group
        groupCounts[groupName] = (groupCounts[groupName] || 0) + 1;

        // Push an async update to Supabase ss_account patching this individual user!
        const updatePromise = supabase
          .from('ss_account')
          .update({ accountGroup: groupName })
          .eq('accountEmail', email);

        updates.push(updatePromise);
      }
    }

    // Await all the user account global profile patch requests simultaneously
    await Promise.all(updates);

    // 5. Build Groupings metadata rows for the `ss_groupings` table
    const groupingsInsert = Object.keys(groupCounts).map(groupName => ({
      groupName: groupName,
      groupMembers: (groupCounts[groupName] || 0).toString(), // Defaulting natively guarding compilation warning
      courseID: courseId
    }));

    // Before inserting, scrub previous groupings on this course to avoid duplicates re-running the Import
    await supabase.from('ss_groupings').delete().eq('courseID', courseId);

    // Insert new groups
    if (groupingsInsert.length > 0) {
      const { error: groupErr } = await supabase
        .from('ss_groupings')
        .insert(groupingsInsert);

      if (groupErr) throw new Error(`Grouping Insert Failed: ${groupErr.message}`);
    }

    return res.json({ success: true, message: `Successfully imported ${Object.keys(groupCounts).length} groups from the Sheet!` });

  } catch (error: any) {
    if (error?.response?.status === 404 || error?.response?.status === 403) {
      return res.status(400).json({ error: "Cannot access this Sheet. Please ensure 'Anyone with the link' can View it!" });
    }
    return res.status(500).json({ error: error?.message || "Failed to parse spreadsheet." });
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
app.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
});