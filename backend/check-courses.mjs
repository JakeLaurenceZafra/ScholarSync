import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgresql://postgres:lovejesus123day@localhost:5432/SkyFlow_Db' });

async function check() {
    const { rows: courses } = await pool.query(
        'SELECT id, "courseName", "courseCode", "courseTerm", "courseAdviser" FROM ss_courses ORDER BY id DESC LIMIT 20'
    );

    console.log('\nCourses in ss_courses:');
    if (courses.length === 0) {
        console.log('  (none)');
    } else {
        courses.forEach(c => console.log(`  [${c.id}] ${c.courseName} (${c.courseCode}) — adviser: ${c.courseAdviser}`));
    }

    await pool.end();
}

check().catch(e => { console.error(e.message); pool.end(); });
