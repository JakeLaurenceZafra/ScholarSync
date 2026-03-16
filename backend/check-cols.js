import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkCols() {
  const { data: groupings } = await supabase.from('ss_groupings').select('*').limit(1);
  const { data: groups } = await supabase.from('ss_group').select('*').limit(1);
  console.log("Groupings columns:", groupings ? Object.keys(groupings[0]) : "NULL");
  console.log("Groups columns:", groups ? Object.keys(groups[0]) : "NULL");
}
checkCols();
