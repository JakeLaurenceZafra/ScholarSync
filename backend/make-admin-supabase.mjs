import pg from 'pg';
const { Client } = pg;

async function makeAdmin() {
    const client = new Client({
        host: 'aws-1-ap-southeast-2.pooler.supabase.com',
        port: 6543,
        database: 'postgres',
        user: 'postgres.fijnckhquezxpflfzcyk',
        password: 'ZroqnJyydPs6RkQy',
        ssl: { rejectUnauthorized: false }
    });

    const email = 'waynepabillon667@gmail.com';
    
    try {
        await client.connect();
        
        // 1. Check if the user exists
        const { rows } = await client.query(
            'SELECT account_id, "accountName", "accountRole" FROM ss_account WHERE "accountEmail" = $1',
            [email]
        );

        if (rows.length === 0) {
            console.error(`❌ User with email ${email} not found in Supabase!`);
            console.log('Please make sure you have signed into the app once.');
            return;
        }

        const user = rows[0];
        console.log(`Found user: ${user.accountName} (Current Role: ${user.accountRole})`);

        // 2. Promote to Admin
        await client.query(
            'UPDATE ss_account SET "accountRole" = \'Admin\' WHERE "accountEmail" = $1',
            [email]
        );
        
        console.log(`✅ SUCCESSFULLY promoted ${email} to Admin!`);
        console.log('👉 Please LOG OUT and LOG IN again to see the changes.');

    } catch (err) {
        console.error('FAILED:', err.message);
    } finally {
        await client.end();
    }
}

makeAdmin();
