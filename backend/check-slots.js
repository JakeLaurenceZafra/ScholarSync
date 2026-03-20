import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'aws-1-ap-southeast-2.pooler.supabase.com',
  port: parseInt(process.env.DB_PORT || '6543'),
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres.fijnckhquezxpflfzcyk',
  password: process.env.DB_PASSWORD || 'ZroqnJyydPs6RkQy',
  ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
});

async function checkSlots() {
  try {
    console.log('📋 Checking consultation slots...\n');
    
    const { rows } = await pool.query(`
      SELECT slot_id, adviser_id, owner_account_id, course_id, slot_date, start_time, end_time, slot_type, max_groups
      FROM ss_consultation_slots
      ORDER BY created_at DESC
      LIMIT 10
    `);
    
    console.log(`Found ${rows.length} slots:`);
    console.log('─'.repeat(120));
    rows.forEach(slot => {
      console.log(`ID: ${slot.slot_id} | Adviser: ${slot.adviser_id} | Owner: ${slot.owner_account_id} | Course: ${slot.course_id} | Date: ${slot.slot_date} | ${slot.start_time}-${slot.end_time}`);
    });
    console.log('─'.repeat(120));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkSlots();
