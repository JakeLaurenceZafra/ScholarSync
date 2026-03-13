import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function check() {
    const tables = ['ss_account', 'ss_courses', 'ss_enrollments', 'ss_groupings', 'ss_group', 'ss_consultation', 'ss_attendance', 'ss_participation'];
    
    for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            console.log(`Error reading ${table}:`, error.message);
        } else {
            console.log(`${table} Schema:`, data?.[0] ? Object.keys(data[0]) : "No rows found");
        }
    }
}
check();
