import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function check() {
  const { data: groupings } = await supabase.from('ss_groupings').select('*').limit(2);
  const { data: groups } = await supabase.from('ss_group').select('*').limit(2);
  console.log("Groupings:", groupings);
  console.log("Groups:", groups);
}
check();
