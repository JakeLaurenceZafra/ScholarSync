import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://postgres:lovejesus123day@localhost:5432/SkyFlow_Db' });

async function check() {
    // Check ss_courses
    const { rows: courses } = await pool.query('SELECT id, "courseName", "courseCode" FROM ss_courses ORDER BY id');
    console.log('\n=== ss_courses ===');
    courses.forEach(c => console.log(`  [${c.id}] ${c.courseName} (${c.courseCode})`));

    // Check ss_groupings
    const { rows: groups } = await pool.query('SELECT "groupID", "groupName", "groupMembers", "courseID" FROM ss_groupings ORDER BY "groupID"');
    console.log('\n=== ss_groupings ===');
    groups.forEach(g => console.log(`  [${g.groupID}] ${g.groupName} — ${g.groupMembers} members — courseID=${g.courseID}`));

    // Check team_groups
    const { rows: teams } = await pool.query('SELECT id, name, team_number FROM team_groups ORDER BY id LIMIT 20');
    console.log('\n=== team_groups ===');
    teams.forEach(t => console.log(`  [${t.id}] ${t.name} (team_number=${t.team_number})`));

    // Check team_group_members
    const { rows: members } = await pool.query('SELECT team_group_id, member_number, name, email FROM team_group_members ORDER BY team_group_id, member_number LIMIT 30');
    console.log('\n=== team_group_members ===');
    members.forEach(m => console.log(`  team_group_id=${m.team_group_id} #${m.member_number} ${m.name} <${m.email}>`));

    // Check ss_account
    const { rows: accounts } = await pool.query('SELECT account_id, "accountName", "accountEmail", "accountGroup" FROM ss_account ORDER BY account_id LIMIT 10');
    console.log('\n=== ss_account ===');
    accounts.forEach(a => console.log(`  [${a.account_id}] ${a.accountName} <${a.accountEmail}> group=${a.accountGroup}`));

    await pool.end();
}

check().catch(function (e) { console.error(e); pool.end(); });
