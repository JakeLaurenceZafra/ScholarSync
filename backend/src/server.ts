import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import cors from 'cors';
import 'dotenv/config';

const { Pool } = pg;
const app = express();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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

      const query = `
        INSERT INTO users (email, name, google_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (email) 
        DO UPDATE SET last_login = NOW()
        RETURNING *;
      `;
      
      const res = await pool.query(query, [email, name, googleId]);
      const user = res.rows[0];

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

    const token = jwt.sign(
      { id: user.id, email: user.email }, 
      "test", 
      { expiresIn: '24h' }
    );
    
    res.redirect(`http://localhost:3000/auth-success?token=${token}`);
  }
);

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