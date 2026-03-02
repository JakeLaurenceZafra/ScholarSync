import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function check() {
    const { data: courses } = await supabase.from('ss_courses').select('*').limit(1);
    console.log('Courses Schema:', Object.keys(courses?.[0] || {}));

    const { data: enrollments } = await supabase.from('ss_enrollments').select('*').limit(5);
    console.log('Enrollments Content:', enrollments);

    const { data: accounts } = await supabase.from('ss_account').select('*').limit(1);
    console.log('Accounts Schema:', Object.keys(accounts?.[0] || {}));
}
check();
