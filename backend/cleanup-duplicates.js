import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function cleanup() {
  // IDs observed from previous dump:
  // ScholarSync (courseID 6): 156, 158. Keep 156.
  // Group 2 (courseID 6): 157, 159. Keep 157.
  
  const idsToDelete = [158, 159];
  
  console.log("Deleting corrupted duplicate IDs:", idsToDelete);
  const { error } = await supabase.from('ss_groupings').delete().in('groupID', idsToDelete);
  
  if (error) {
    console.error("Cleanup failed:", error);
  } else {
    console.log("Cleanup successful.");
  }
}

cleanup();
