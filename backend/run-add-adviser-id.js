import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  host: process.env.DB_HOST || 'aws-1-ap-southeast-2.pooler.supabase.com',
  port: parseInt(process.env.DB_PORT || '6543'),
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres.fijnckhquezxpflfzcyk',
  password: process.env.DB_PASSWORD || 'ZroqnJyydPs6RkQy',
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    console.log('🔄 Adding adviser_id column to ss_consultation_slots...');
    
    const migrationPath = path.join(__dirname, 'add-adviser-id-column.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    await pool.query(sql);
    
    console.log('✅ adviser_id column added successfully!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
