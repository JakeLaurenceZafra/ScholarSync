import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function dump() {
  const { data: groupings } = await supabase.from('ss_groupings').select('*');
  console.log("All Groupings:", JSON.stringify(groupings, null, 2));
}
dump();
