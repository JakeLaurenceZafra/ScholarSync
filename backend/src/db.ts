import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || 'aws-1-ap-southeast-2.pooler.supabase.com',
  port: parseInt(process.env.DB_PORT || '6543'),
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres.fijnckhquezxpflfzcyk',
  password: process.env.DB_PASSWORD || 'ZroqnJyydPs6RkQy',
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
});

export default pool;
