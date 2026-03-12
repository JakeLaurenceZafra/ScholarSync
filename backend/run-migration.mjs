import fs from 'fs';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://postgres.fijnckhquezxpflfzcyk:pl5OPQRGzZpycNb8@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres' });

async function runMigration() {
    try {
        const sql = fs.readFileSync('c:/Users/Dayne Pabillon/Desktop/SkyFlow/SKyFlow.Google/backend/src/migrations/020_scholarsync.sql', 'utf8');
        await pool.query(sql);
        console.log('Migration 020_scholarsync.sql executed successfully!');
    } catch (err) {
        console.error('Migration failed:', err.message);
    } finally {
        await pool.end();
    }
}

runMigration();
