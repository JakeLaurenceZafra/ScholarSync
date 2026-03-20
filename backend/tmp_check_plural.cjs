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
    const res = await pool.query('SELECT COUNT(*) FROM ss_consultations');
    console.log('ss_consultations count:', res.rows[0].count);
    
    if (res.rows[0].count > 0) {
      const data = await pool.query('SELECT * FROM ss_consultations LIMIT 5');
      console.log('Data:', JSON.stringify(data.rows, null, 2));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();
