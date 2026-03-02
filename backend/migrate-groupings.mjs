import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: 'postgresql://postgres:lovejesus123day@localhost:5432/SkyFlow_Db' });

async function migrate() {
    // Add members_json column to ss_groupings (stores [{name, email, is_leader}])
    await pool.query(`
    ALTER TABLE ss_groupings 
    ADD COLUMN IF NOT EXISTS members_json JSONB DEFAULT '[]'::jsonb
  `);
    console.log('✅ Added members_json column to ss_groupings');

    // Add adviser column to ss_groupings (detected from sheet ADVISER column)
    await pool.query(`
    ALTER TABLE ss_groupings 
    ADD COLUMN IF NOT EXISTS adviser TEXT DEFAULT ''
  `);
    console.log('✅ Added adviser column to ss_groupings');

    // Add proposed_project column to ss_groupings (from PROPOSED PROJECT column)
    await pool.query(`
    ALTER TABLE ss_groupings 
    ADD COLUMN IF NOT EXISTS proposed_project TEXT DEFAULT ''
  `);
    console.log('✅ Added proposed_project column to ss_groupings');

    // Add consultation_dates column (array of dates)
    await pool.query(`
    ALTER TABLE ss_groupings 
    ADD COLUMN IF NOT EXISTS consultation_dates JSONB DEFAULT '[]'::jsonb
  `);
    console.log('✅ Added consultation_dates column to ss_groupings');

    // Add comments column 
    await pool.query(`
    ALTER TABLE ss_groupings 
    ADD COLUMN IF NOT EXISTS comments TEXT DEFAULT ''
  `);
    console.log('✅ Added comments column to ss_groupings');

    // Add grade column
    await pool.query(`
    ALTER TABLE ss_groupings 
    ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT ''
  `);
    console.log('✅ Added grade column to ss_groupings');

    await pool.end();
    console.log('\n✅ Migration complete!');
}

migrate().catch(function (e) { console.error(e.message); pool.end(); });
