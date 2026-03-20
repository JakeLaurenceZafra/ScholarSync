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

async function checkAndEnroll() {
  try {
    const email = 'waynepabillon667@gmail.com';
    
    console.log('\n🔄 Checking ScholarSync enrollment...\n');
    
    // Get user account ID
    const { rows: accounts } = await pool.query(
      'SELECT account_id, "accountName", "accountEmail", "accountRole", "accountGroup" FROM ss_account WHERE "accountEmail" = $1',
      [email]
    );
    
    if (accounts.length === 0) {
      console.log('❌ Account not found in ss_account table\n');
      process.exit(1);
    }
    
    const account = accounts[0];
    console.log('✅ Account found:');
    console.log(`   ID: ${account.account_id}`);
    console.log(`   Name: ${account.accountName}`);
    console.log(`   Role: ${account.accountRole}`);
    console.log(`   Group: ${account.accountGroup || 'None'}\n`);
    
    // Check enrollments
    const { rows: enrollments } = await pool.query(
      'SELECT * FROM ss_enrollments WHERE account_id = $1',
      [account.account_id]
    );
    
    console.log(`📚 Current enrollments: ${enrollments.length}`);
    
    if (enrollments.length > 0) {
      enrollments.forEach((e, i) => {
        console.log(`   ${i + 1}. Course ID: ${e.course_id}`);
      });
      console.log('');
    }
    
    // Check available courses
    const { rows: courses } = await pool.query(
      'SELECT id, "courseName", "courseCode", "courseSection" FROM ss_courses ORDER BY id'
    );
    
    console.log(`📋 Available courses: ${courses.length}`);
    courses.forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.courseCode} - ${c.courseName} (${c.courseSection}) [ID: ${c.id}]`);
    });
    console.log('');
    
    // Enroll in course 1 if not already enrolled
    const alreadyEnrolled = enrollments.some(e => e.course_id === 1);
    
    if (!alreadyEnrolled) {
      console.log('🔄 Enrolling in Course 1 (IT332)...\n');
      
      await pool.query(
        'INSERT INTO ss_enrollments (account_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [account.account_id, 1]
      );
      
      // Update course amount
      await pool.query(
        'UPDATE ss_courses SET "courseAmount" = "courseAmount" + 1 WHERE id = $1',
        [1]
      );
      
      console.log('✅ Enrolled in Course 1!\n');
    } else {
      console.log('✅ Already enrolled in Course 1\n');
    }
    
    console.log('🎉 Done! Refresh ScholarSync to see your courses!\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkAndEnroll();
