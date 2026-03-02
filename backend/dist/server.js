import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import 'dotenv/config';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const app = express();
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:5000/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
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
            return done(null, { isNew: true, email: email });
        }
        // Generate random account_id for legacy/JWT compatibility if not present (assuming UUID typically)
        // We pass the existing user directly
        return done(null, { ...user, id: user.account_id, email: user.accountEmail });
        return done(null, user);
    }
    catch (err) {
        return done(err);
    }
}));
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { session: false, failureRedirect: 'http://localhost:3000/login' }), (req, res) => {
    const user = req.user;
    if (user.isNew) {
        // Temporary token just containing their email to prove they passed Google OAuth
        const tempToken = jwt.sign({ email: user.email, isRegistrationToken: true }, process.env.JWT_SECRET || "test", { expiresIn: '15m' });
        return res.redirect(`http://localhost:3000/complete-profile?token=${tempToken}`);
    }
    // Existing user
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || "test", { expiresIn: '24h' });
    res.redirect(`http://localhost:3000/auth-success?token=${token}`);
});
app.post('/api/complete-profile', async (req, res) => {
    const { token, name } = req.body;
    if (!token || !name)
        return res.status(400).json({ error: "Missing token or name" });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "test");
        if (!decoded.isRegistrationToken || !decoded.email) {
            return res.status(400).json({ error: "Invalid registration token" });
        }
        const email = decoded.email;
        const account_id = crypto.randomUUID(); // Assuming account_id is a UUID. If auto-increment, omit this.
        const { data: newUser, error } = await supabase
            .from('ss_account')
            .insert([{ account_id, accountName: name, accountEmail: email }])
            .select()
            .single();
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        // Create session token
        const sessionToken = jwt.sign({ id: newUser.account_id, email: newUser.accountEmail }, process.env.JWT_SECRET || "test", { expiresIn: '24h' });
        res.json({ token: sessionToken, user: newUser });
    }
    catch (error) {
        return res.status(401).json({ error: "Token expired or invalid" });
    }
});
app.get('/api/me', (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token)
        return res.sendStatus(401);
    jwt.verify(token, "test", (err, user) => {
        if (err)
            return res.sendStatus(403);
        res.json(user);
    });
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Backend running on http://localhost:${PORT}`);
});
//# sourceMappingURL=server.js.map