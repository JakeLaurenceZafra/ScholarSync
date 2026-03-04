import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://postgres:lovejesus123day@localhost:5432/SkyFlow_Db' });

async function migrate() {
    console.log('=== Unifying team_groups table ===\n');

    // 1. Add ScholarSync-specific columns to team_groups
    const columns = [
        'ALTER TABLE team_groups ADD COLUMN IF NOT EXISTS course_id INTEGER',
        'ALTER TABLE team_groups ADD COLUMN IF NOT EXISTS proposed_project TEXT',
        "ALTER TABLE team_groups ADD COLUMN IF NOT EXISTS consultation_dates JSONB DEFAULT '[]'",
        "ALTER TABLE team_groups ADD COLUMN IF NOT EXISTS comments TEXT DEFAULT ''",
        "ALTER TABLE team_groups ADD COLUMN IF NOT EXISTS grade VARCHAR(10) DEFAULT ''",
    ];

    for (const sql of columns) {
        await pool.query(sql);
        console.log('✅', sql.split('ADD COLUMN IF NOT EXISTS ')[1]);
    }

    // 2. Create index on course_id for fast lookups
    await pool.query('CREATE INDEX IF NOT EXISTS idx_team_groups_course_id ON team_groups(course_id)');
    console.log('✅ Created index on course_id');

    // 3. Drop ss_groupings (no longer needed)
    await pool.query('DROP TABLE IF EXISTS ss_groupings CASCADE');
    console.log('✅ Dropped ss_groupings table');

    // 4. Clear old team_groups data for clean re-import
    await pool.query('DELETE FROM team_group_members');
    await pool.query('DELETE FROM team_checkpoints');
    await pool.query('DELETE FROM team_comments');
    await pool.query('DELETE FROM team_groups');
    console.log('✅ Cleared old team_groups data for fresh import');

    console.log('\n👉 Now go to ScholarSync → Workspace Sync → Import your sheet');
    console.log('   Groups will appear in BOTH ScholarSync and SkyFlow!');

    await pool.end();
}

migrate().catch(e => { console.error('❌ Migration failed:', e.message); pool.end(); });
