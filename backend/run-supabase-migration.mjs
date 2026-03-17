import fs from 'fs';
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// Use the credentials found in server.ts
const pool = new Pool({
  host: process.env.DB_HOST || 'aws-1-ap-southeast-2.pooler.supabase.com',
  port: parseInt(process.env.DB_PORT || '6543'),
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres.fijnckhquezxpflfzcyk',
  password: process.env.DB_PASSWORD || 'ZroqnJyydPs6RkQy',
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
    const migrationPath = process.argv[2];
    if (!migrationPath) {
        console.error('❌ Please provide a path to a migration file.');
        process.exit(1);
    }

    if (!fs.existsSync(migrationPath)) {
        console.error(`❌ File not found: ${migrationPath}`);
        process.exit(1);
    }

    const sql = fs.readFileSync(migrationPath, 'utf8');
    console.log(`📄 Running migration from: ${migrationPath}`);

    try {
        await pool.query(sql);
        console.log('✅ Migration executed successfully!');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await pool.end();
    }
}

runMigration();
