import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function check() {
    const { data: groupings } = await supabase.from('ss_groupings').select('*').limit(1);
    console.log("Groupings Schema:", groupings?.[0] ? Object.keys(groupings[0]) : "No groupings found");
}
check();
