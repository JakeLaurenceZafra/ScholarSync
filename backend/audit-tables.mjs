import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://postgres:lovejesus123day@localhost:5432/SkyFlow_Db' });

async function audit() {
    const tables = ['ss_account', 'ss_courses', 'ss_enrollments', 'ss_groupings'];
    for (const tbl of tables) {
        console.log(`\n--- ${tbl} ---`);
        const res = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = $1 
            ORDER BY ordinal_position
        `, [tbl]);
        res.rows.forEach(r => console.log(` ${r.column_name}: ${r.data_type}`));
    }
    await pool.end();
}

audit().catch(e => { console.error(e); pool.end(); });
