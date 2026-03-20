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
    console.log('🔄 Running consultation tables migration...');
    
    const migrationPath = path.join(__dirname, 'src', 'migrations', 'create_consultation_tables.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    await pool.query(sql);
    
    console.log('✅ Consultation tables created successfully!');
    console.log('   - consultation_slots');
    console.log('   - consultation_bookings');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
