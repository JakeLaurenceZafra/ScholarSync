import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://postgres:lovejesus123day@localhost:5432/SkyFlow_Db' });

async function clear() {
    await pool.query('DELETE FROM team_group_members');
    console.log('✅ Cleared team_group_members');
    await pool.query('DELETE FROM team_checkpoints');
    console.log('✅ Cleared team_checkpoints');
    await pool.query('DELETE FROM team_comments');
    console.log('✅ Cleared team_comments');
    await pool.query('DELETE FROM team_groups');
    console.log('✅ Cleared team_groups');
    await pool.query('DELETE FROM ss_connected_sheets');
    console.log('✅ Cleared ss_connected_sheets');
    await pool.query('DELETE FROM ss_courses');
    console.log('✅ Cleared ss_courses');

    console.log('\n👉 All data cleared. Go to ScholarSync → Workspace Sync and re-import!');
    await pool.end();
}

clear().catch(e => { console.error(e.message); pool.end(); });
