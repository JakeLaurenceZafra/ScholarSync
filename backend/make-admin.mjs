import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: 'postgresql://postgres:lovejesus123day@localhost:5432/SkyFlow_Db' });

async function makeAdmin() {
    // Show all accounts
    const { rows: accounts } = await pool.query(
        'SELECT account_id, "accountName", "accountEmail", "accountRole" FROM ss_account ORDER BY account_id'
    );

    if (accounts.length === 0) {
        console.log('No accounts found in ss_account table.');
        await pool.end();
        return;
    }

    console.log('\nCurrent accounts:');
    accounts.forEach(a => {
        console.log(`  [${a.account_id}] ${a.accountName} <${a.accountEmail}> — ${a.accountRole}`);
    });

    // Promote ALL accounts to Admin (or change to specific email below)
    const email = accounts[0].accountEmail; // Promote the first account
    await pool.query('UPDATE ss_account SET "accountRole" = \'Admin\' WHERE "accountEmail" = $1', [email]);
    console.log(`\n✅ Promoted ${email} to Admin!`);
    console.log('👉 Log out and sign back in to get a fresh JWT with the new role.');

    await pool.end();
}

makeAdmin().catch(e => { console.error(e.message); pool.end(); });
