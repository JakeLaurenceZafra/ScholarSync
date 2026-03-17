const pg = require('pg');
const pool = new pg.Pool({
  host: 'aws-1-ap-southeast-2.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.fijnckhquezxpflfzcyk',
  password: 'ZroqnJyydPs6RkQy',
  ssl: { rejectUnauthorized: false }
});

async function check() {
  try {
    const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'ai_insights_cache'");
    console.log('ai_insights_cache schema:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();
