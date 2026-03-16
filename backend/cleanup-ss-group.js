import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function cleanupDetails() {
  const { data: groups } = await supabase.from('ss_group').select('groupName, smallgroupID');
  
  if (!groups) return;

  const seen = new Set();
  const toDelete = [];

  groups.forEach(g => {
    if (seen.has(g.groupName)) {
      toDelete.push(g.smallgroupID);
    } else {
      seen.add(g.groupName);
    }
  });

  if (toDelete.length > 0) {
    console.log("Deleting duplicate group details IDs:", toDelete);
    const { error } = await supabase.from('ss_group').delete().in('smallgroupID', toDelete);
    if (error) console.error("Error:", error);
    else console.log("Success.");
  } else {
    console.log("No duplicates found in ss_group.");
  }
}

cleanupDetails();
