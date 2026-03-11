const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres:lovejesus123day@localhost:5432/SkyFlow_Db' });

async function check() {
  try {
    console.log("--- ORGANIZATIONS ---");
    const orgs = await pool.query('SELECT id, name FROM organizations');
    console.table(orgs.rows);

    console.log("\n--- TEAM GROUPS ---");
    const teams = await pool.query('SELECT id, organization_id, name, adviser_name, adviser_id FROM team_groups');
    console.table(teams.rows);

    console.log("\n--- ORGANIZATION MEMBERS ---");
    const members = await pool.query('SELECT organization_id, user_id, role, status FROM organization_members');
    console.table(members.rows);

    console.log("\n--- USERS (LIMIT 5) ---");
    const users = await pool.query('SELECT id, email, name FROM users LIMIT 5');
    console.table(users.rows);

  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
check();
