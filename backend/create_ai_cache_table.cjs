const pg = require('pg');
const pool = new pg.Pool({
  host: 'aws-1-ap-southeast-2.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.fijnckhquezxpflfzcyk',
  password: 'ZroqnJyydPs6RkQy',
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  try {
    console.log('Creating ss_ai_cache table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ss_ai_cache (
        id SERIAL PRIMARY KEY,
        course_id INTEGER,
        group_name TEXT,
        type TEXT,
        result TEXT,
        data_hash TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      
      -- Add a unique constraint to allow UPSERT
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ss_ai_cache_unique_key') THEN
          ALTER TABLE ss_ai_cache ADD CONSTRAINT ss_ai_cache_unique_key UNIQUE (course_id, group_name, type);
        END IF;
      END $$;
    `);
    console.log('ss_ai_cache table created successfully.');
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

migrate();
