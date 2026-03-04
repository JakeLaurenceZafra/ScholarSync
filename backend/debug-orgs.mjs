import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://postgres:lovejesus123day@localhost:5432/SkyFlow_Db' });

async function check() {
    const tg = await pool.query('SELECT id, organization_id, team_number, name, course_id FROM team_groups LIMIT 5');
    console.log('=== team_groups ===');
    console.log(tg.rows);

    const orgs = await pool.query('SELECT id, name FROM organizations');
    console.log('\n=== organizations ===');
    console.log(orgs.rows);

    const om = await pool.query('SELECT organization_id, user_id, role FROM organization_members LIMIT 5');
    console.log('\n=== organization_members ===');
    console.log(om.rows);

    await pool.end();
}

check().catch(e => { console.error(e.message); pool.end(); });
