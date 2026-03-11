const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:lovejesus123day@localhost:5432/SkyFlow_Db' });

async function wipe() {
  try {
    const { rows } = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const tables = rows.map(r => r.table_name).filter(t => 
      t !== 'ss_account' && 
      t !== 'account' && 
      t !== 'students' && 
      t !== 'teachers' && 
      t !== 'users'
    );
    
    if(tables.length === 0) {
        console.log("No tables to wipe");
        return;
    }
    
    // Join with quotes for correct casing
    const tableList = tables.map(t => `"${t}"`).join(', ');
    
    console.log(`Truncating tables: ${tableList}...`);
    // CASCADE will delete dependent rows as well
    await pool.query(`TRUNCATE TABLE ${tableList} CASCADE`);
    console.log('Wipe complete!');
  } catch (err) {
    console.error("Error wiping database:", err);
  } finally {
    pool.end();
  }
}
wipe();
