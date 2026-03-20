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

async function addToGroup12() {
  try {
    const email = 'waynepabillon667@gmail.com';
    
    console.log('\n🔄 Finding group 12...\n');
    
    // Find group with team_number = 12
    const { rows: groups } = await pool.query(
      `SELECT id, name, team_number, course_id 
       FROM team_groups 
       WHERE team_number = 12 
       ORDER BY created_at DESC 
       LIMIT 1`
    );
    
    if (groups.length === 0) {
      console.log('❌ Group 12 not found. Available groups:');
      const { rows: allGroups } = await pool.query(
        'SELECT team_number, name, course_id FROM team_groups ORDER BY team_number'
      );
      allGroups.forEach(g => {
        console.log(`   Team ${g.team_number}: ${g.name} (Course ${g.course_id})`);
      });
      process.exit(1);
    }
    
    const group12 = groups[0];
    console.log(`✅ Found group 12: "${group12.name}"`);
    console.log(`   Course ID: ${group12.course_id}`);
    console.log(`   Team Number: ${group12.team_number}\n`);
    
    // Update ss_account to set accountGroup
    console.log('🔄 Adding you to group 12...\n');
    
    const { rows: updated } = await pool.query(
      'UPDATE ss_account SET "accountGroup" = $1 WHERE "accountEmail" = $2 RETURNING *',
      [group12.name, email]
    );
    
    if (updated.length > 0) {
      console.log('✅ Successfully added to group 12!');
      console.log(`   Your group: ${updated[0].accountGroup}`);
      console.log(`   Name: ${updated[0].accountName}`);
      console.log(`   Role: ${updated[0].accountRole}\n`);
      console.log('🔄 Refresh ScholarSync to see your group!\n');
    } else {
      console.log('❌ Account not found in ss_account table\n');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addToGroup12();
