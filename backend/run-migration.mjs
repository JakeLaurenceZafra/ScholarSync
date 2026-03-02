import fs from 'fs';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://postgres:lovejesus123day@localhost:5432/SkyFlow_Db' });

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
