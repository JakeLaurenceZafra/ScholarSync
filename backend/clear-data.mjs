import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://postgres:lovejesus123day@localhost:5432/SkyFlow_Db' });

async function clear() {
    // Clear old groupings (they don't have members_json populated)
    await pool.query('DELETE FROM ss_groupings');
    console.log('✅ Cleared ss_groupings');

    // Clear connected sheets (so import can run fresh)
    await pool.query('DELETE FROM ss_connected_sheets');
    console.log('✅ Cleared ss_connected_sheets');

    // Clear courses (they'll be recreated on import)
    await pool.query('DELETE FROM ss_courses');
    console.log('✅ Cleared ss_courses');

    console.log('\n👉 Now go to ScholarSync → Workspace Sync → Detect My Sheets → Import');
    console.log('   The groups will now include member names, adviser, and proposed project.');

    await pool.end();
}

clear().catch(function (e) { console.error(e); pool.end(); });
