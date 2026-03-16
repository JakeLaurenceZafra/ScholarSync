
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function testSync() {
  const courseId = 6;
  
  // 1. Check current IDs
  const { data: before } = await supabase.from('ss_groupings').select('*').eq('courseID', courseId);
  console.log("IDs Before Mock Sync:", before.map(b => ({ id: b.groupID, name: b.groupName })));
  
  // 2. We can't call the actual function easily because it depends on axios/google-sheets
  // BUT we can verify the DB logic by manually calling the same Supabase patterns
  
  const groupsToSync = ["ScholarSync", "Group 2"]; // Same names
  
  for (const name of groupsToSync) {
    const { data: existing } = await supabase.from('ss_groupings').select('groupID').eq('courseID', courseId).eq('groupName', name).single();
    if (existing) {
       // Mock Update
       await supabase.from('ss_groupings').update({ groupMembers: "4" }).eq('groupID', existing.groupID);
    }
  }
  
  // 3. Check IDs after
  const { data: after } = await supabase.from('ss_groupings').select('*').eq('courseID', courseId);
  console.log("IDs After Mock Sync:", after.map(a => ({ id: a.groupID, name: a.groupName })));
}

testSync();
