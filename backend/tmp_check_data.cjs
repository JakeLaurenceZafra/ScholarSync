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
    const res = await pool.query('SELECT "groupName", "isDraft", "courseID" FROM ss_consultation');
    console.log('Consultations:', JSON.stringify(res.rows, null, 2));
    
    const groups = await pool.query('SELECT name, course_id FROM team_groups');
    console.log('Groups:', JSON.stringify(groups.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

check();
