const pg = require('pg');
const pool = new pg.Pool({
  host: 'aws-1-ap-southeast-2.pooler.supabase.com',
  port: 6543,
  database: 'postgres',
  user: 'postgres.fijnckhquezxpflfzcyk',
  password: 'ZroqnJyydPs6RkQy',
  ssl: { rejectUnauthorized: false }
});

async function insert() {
  try {
    const query = `
      INSERT INTO ss_consultation 
      ("courseID", "groupName", "conDate", "conType", "conMil", "conSum", "conAction", "conAtt", "isDraft", "conStat", "conNotes")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING "conID"
    `;
    const values = [
      1, 
      'Group 1', 
      '2023-10-27', 
      'Consultation', 
      'Milestone 1: Project Proposal', 
      'The team successfully presented their project proposal for Learnify. They have a clear objective to build an AI-powered study assistant. Participation was high, with all members contributing to the discussion about the database schema.', 
      'Refine the SMART goals and start drafting the SRS document.', 
      'All Present', 
      false, 
      'Approved', 
      'Great progress so far.'
    ];
    
    const res = await pool.query(query, values);
    console.log('Mockup journal inserted with ID:', res.rows[0].conID);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

insert();
