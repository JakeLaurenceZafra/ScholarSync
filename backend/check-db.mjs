import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://postgres:lovejesus123day@localhost:5432/SkyFlow_Db' });

async function check() {
    // All tables
    const tables = await pool.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
  `);
    console.log('=== ALL TABLES ===');
    tables.rows.forEach(r => console.log(' -', r.tablename));

    // team_groups columns
    const tgCols = await pool.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'team_groups' ORDER BY ordinal_position
  `);
    console.log('\n=== team_groups columns ===');
    tgCols.rows.forEach(r => console.log(` ${r.column_name}: ${r.data_type}`));

    // Row counts key tables
    const counts = await pool.query(`
    SELECT 'team_groups' as tbl, COUNT(*) FROM team_groups
    UNION ALL SELECT 'team_group_members', COUNT(*) FROM team_group_members
    UNION ALL SELECT 'team_comments', COUNT(*) FROM team_comments
    UNION ALL SELECT 'organizations', COUNT(*) FROM organizations
    UNION ALL SELECT 'users', COUNT(*) FROM users
    UNION ALL SELECT 'ss_courses', COUNT(*) FROM ss_courses
  `);
    console.log('\n=== Row counts ===');
    counts.rows.forEach(r => console.log(` ${r.tbl}: ${r.count}`));

    // migrations applied
    const migrations = await pool.query(`
    SELECT name, applied_at FROM schema_migrations ORDER BY applied_at DESC LIMIT 10
  `).catch(() => ({ rows: [] }));
    if (migrations.rows.length > 0) {
        console.log('\n=== Recent migrations ===');
        migrations.rows.forEach(r => console.log(` ${r.name} - ${r.applied_at}`));
    }

    await pool.end();
}

check().catch(e => { console.error(e.message); pool.end(); });
