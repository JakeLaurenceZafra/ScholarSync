import fs from 'fs';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Kenneth's local PostgreSQL connection
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'SkyFlow_Db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || undefined, // Set DB_PASSWORD env var if needed
});

async function runMigration() {
    // Find the 020_scholarsync.sql migration file
    const possiblePaths = [
        path.join(__dirname, '..', '..', 'SKyFlow.Google', 'backend', 'src', 'migrations', '020_scholarsync.sql'),
        path.join(__dirname, '..', 'SKyFlow.Google', 'backend', 'src', 'migrations', '020_scholarsync.sql'),
        'C:/Users/Kenneth/capstone/SKyFlow.Google/backend/src/migrations/020_scholarsync.sql',
    ];

    let sql = null;
    let usedPath = null;

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            sql = fs.readFileSync(p, 'utf8');
            usedPath = p;
            break;
        }
    }

    if (!sql) {
        console.error('❌ Could not find 020_scholarsync.sql. Make sure it exists in SKyFlow.Google/backend/src/migrations/');
        console.log('Tried:', possiblePaths.join('\n'));
        await pool.end();
        return;
    }

    console.log(`📄 Running migration from: ${usedPath}`);
    try {
        await pool.query(sql);
        console.log('✅ Migration 020_scholarsync.sql executed successfully on LOCAL database!');
        console.log('👉 Now restart the backend with: npm run dev');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await pool.end();
    }
}

runMigration();
